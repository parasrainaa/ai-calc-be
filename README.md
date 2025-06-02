# AI Calculator Bun Backend (HonoJS)

This backend provides an API endpoint to analyze mathematical expressions from images using the Gemini API, built with HonoJS.

## Prerequisites

- Bun (latest version recommended)
- A Gemini API Key

## How it Works

1.  The server receives a base64 encoded image and a dictionary of variables.
2.  It sends the image and a detailed prompt to the Gemini API.
3.  The Gemini API analyzes the image for mathematical expressions based on the prompt.
4.  The server parses the response from Gemini and returns it in a structured JSON format.

## Notes

- The Bun backend uses HonoJS as its web framework.
- It uses port `8900` by default. You can change this in the `.env` file.
- Ensure your `GEMINI_API_KEY` is correctly set in the `.env` file for the API calls to succeed.
