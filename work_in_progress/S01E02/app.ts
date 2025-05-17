import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import OpenAI from 'openai';

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Configure middleware
app.use(express.json());

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Endpoint configuration
const VERIFY_ENDPOINT = 'https://xyz.ag3nts.org/verify';

// Load system prompt
const systemPrompt = fs.readFileSync(path.join(__dirname, '0_13_4b.txt'), 'utf8');

// Check for flag in format {{FLG:SOMETHING}}
function extractFlag(text: string) {
    const flagMatch = text.match(/{{FLG:([^}]+)}}/);
    return flagMatch ? flagMatch[1] : null;
}

// Main verification function
async function runVerification() {
    try {
        // Initialize conversation
        let msgID = "0";
        let message = "READY";
        let conversationHistory: Array<OpenAI.ChatCompletionMessageParam> = [];

        console.log("Starting the verification process...");

        while (true) {
            // Send request to verification endpoint
            const verifyResponse = await axios.post(VERIFY_ENDPOINT, {
                text: message,
                msgID: msgID
            });

            const responseData = verifyResponse.data;
            console.log(`Received from endpoint: ${JSON.stringify(responseData)}`);

            // Extract text and msgID
            const receivedText = responseData.text;
            msgID = responseData.msgID;

            // Check if response contains a flag
            const flag = extractFlag(receivedText);
            if (flag) {
                console.log(`Found flag: ${flag}`);
                return { flag };
            }

            // Add to conversation history
            conversationHistory.push({
                role: "assistant",
                content: JSON.stringify({ text: message, msgID: msgID })
            });
            conversationHistory.push({
                role: "user",
                content: JSON.stringify(responseData)
            });

            // Check if this is the final response (no more questions)
            if (receivedText === "OK" || receivedText.includes("alarm")) {
                console.log("Verification process completed.");
                console.log(`Final response: ${receivedText}`);
                return responseData;
            }

            // Use OpenAI to generate response based on the system prompt
            const completion = await openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...conversationHistory
                ],
            });

            // Extract response from OpenAI
            const aiResponse = completion.choices[0].message.content || "";
            console.log(`OpenAI response: ${aiResponse}`);

            // Check if AI response contains a flag
            const aiFlag = extractFlag(aiResponse);
            if (aiFlag) {
                console.log(`Found flag in AI response: ${aiFlag}`);
                return { flag: aiFlag };
            }

            // Parse the AI response to get just the text content
            try {
                const parsedResponse = JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
                message = parsedResponse.text;
            } catch (error) {
                console.error("Failed to parse AI response:", error);
                // Try to extract the text directly if parsing failed
                const match = aiResponse.match(/"text"\s*:\s*"([^"]+)"/);
                if (match && match[1]) {
                    message = match[1];
                } else {
                    throw new Error("Could not extract response text from AI");
                }
            }

            // Check if the message contains a flag
            const messageFlag = extractFlag(message);
            if (messageFlag) {
                console.log(`Found flag in message: ${messageFlag}`);
                return { flag: messageFlag };
            }
        }
    } catch (error) {
        console.error("Error during verification process:", error);
        return { error };
    }
}

// API routes
app.get('/', (req, res) => {
    res.send('Verification API is running. Use GET /start-verification to begin.');
});

app.get('/start-verification', async (req, res) => {
    try {
        const result = await runVerification();

        // If a flag was found, return just the flag
        if (result.flag) {
            return res.json({ flag: result.flag });
        }

        // Otherwise return the complete result
        res.json({
            status: 'completed',
            result: result
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
