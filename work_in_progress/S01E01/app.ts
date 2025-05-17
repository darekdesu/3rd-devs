import express from "express";
import dotenv from "dotenv";
import { OpenAI } from "openai";
import axios from "axios";
import { parse } from "node-html-parser";

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const port = 3001;

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json());

// Main route that fetches website content and processes it
app.get("/process-website", async (req, res) => {
    try {
        // Fetch HTML from the website
        const response = await axios.get("https://xyz.ag3nts.org/");
        const html = response.data;

        // Parse HTML
        const root = parse(html);

        // Extract question from element with ID "human-question"
        const questionElement = root.getElementById("human-question");

        if (!questionElement) {
            return res.status(404).json({ error: "Question element not found on the page" });
        }

        const question = questionElement.textContent.trim();

        // Send question to ChatGPT
        // Send question to ChatGPT with specific instructions
        const chatCompletion = await openai.chat.completions.create({
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: "You are a precise assistant that answers questions about historical years. Return ONLY the year as a four-digit number without any additional text. If you're unsure of the exact year, respond with 'Unknown'."
            },
            { role: "user", content: question }
          ],
          temperature: 0.3 // Lower temperature for more precise answers
        });

        // Extract and return the response
        const answer = chatCompletion.choices[0].message.content;

        // Create form data to send
        const formData = new URLSearchParams();
        formData.append('username', 'tester');
        formData.append('password', '574e112a');
        formData.append('answer', answer || 'Unknown');

        // Send the answer to the specified URL
        try {
          const postResponse = await axios.post('https://xyz.ag3nts.org', formData, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          });

            // Extract flag pattern from the response HTML
            let flag = null;
            if (postResponse.data) {
                // Parse the HTML response
                const responseRoot = parse(postResponse.data);

                // Convert to string to search for pattern if it's not in an element
                const responseHtml = typeof postResponse.data === 'string'
                    ? postResponse.data
                    : responseRoot.toString();

                // Look for the pattern {{FLG:FLAG_NAME}}
                const flagMatch = responseHtml.match(/\{\{FLG:(.*?)\}\}/);
                if (flagMatch && flagMatch[1]) {
                    flag = flagMatch[1];
                }
            }

          // Return both the question, answer and post response
          res.json({
            question,
            answer,
            flag,
            postResult: postResponse.data
          });
        } catch (postError) {
          console.error("Error posting answer:", postError);
          res.status(500).json({
            question,
            answer,
            error: "Failed to post answer to xyz.ag3nts.org"
          });
        }

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "An error occurred while processing the request" });
    }
});

// Default route
app.get("/", (req, res) => {
    res.send("Website question processing API. Use /process-website to fetch and process questions.");
});

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
