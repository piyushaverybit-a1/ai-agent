import { UIMessage, streamText, convertToModelMessages, tool, InferUITools, UIDataTypes, stepCountIs } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import z from "zod";
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});


const tools = {
  getWeather: tool({
  description: "Get the current weather for a city",

  inputSchema: z.object({
    city: z.string().describe("The city to get the weather for"),
  }),

  execute: async ({ city }) => {
    console.log(" TOOL CALLED:", city);
    const geoResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
    );

    const geoData = await geoResponse.json();

    if (!geoData.results?.length) {
      return `Could not find city: ${city}`;
    }

    const location = geoData.results[0];
    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,weather_code`
    );

    const weatherData = await weatherResponse.json();

    return {
      city: location.name,
      country: location.country,
      temperature: weatherData.current.temperature_2m,
      weatherCode: weatherData.current.weather_code,
    };
  },
}),
};

export type ChatTools = InferUITools<typeof tools>;
export type ChatMessage = UIMessage<never, UIDataTypes, ChatTools>;
export async function POST(req: Request) {
  try {
    const { messages = [] }: { messages: ChatMessage[] } = await req.json();

    const modelMessages = await convertToModelMessages(messages);

    const result = streamText({
      model: openrouter(process.env.MODEL),

      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(2),
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        console.error("Stream error details:", error);
        return error instanceof Error ? error.message : "Unknown error occurred";
      },
    });
  } catch (error) {
    console.error("Error streaming chat completion:", error);
    return new Response(
      error instanceof Error ? error.message : "Failed to stream chat completion",
      { status: 500 }
    );
  }
}