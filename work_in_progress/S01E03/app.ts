import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import axios from 'axios';

interface TestItem {
    question: string;
    answer: number;
    test?: {
        q: string;
        a: string;
    };
}

interface JsonData {
    apikey: string;
    description: string;
    copyright: string;
    "test-data": TestItem[];
}

interface OpenAIResponse {
    choices: {
        message: {
            content: string;
        };
    }[];
}

const app = express();
const PORT = 3000;

app.use(express.json());

async function askOpenAI(question: string): Promise<string> {
    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4.1-mini',
                messages: [{ role: 'system', content: 'You are answering question trying to be precise and not use full sentences at all. Just simple answers' }, { role: 'user', content: question }],
                max_tokens: 100,
                temperature: 0.3
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const data = response.data as OpenAIResponse;
        return data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error calling OpenAI:', error);
        return 'Could not get an answer from AI';
    }
}

app.get('/validate', async (req, res) => {
    try {
        // Read the JSON file
        const filePath = path.join(__dirname, 'json-txt.json');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const jsonData: JsonData = JSON.parse(fileContent);

        // Extract test data
        const testData = jsonData["test-data"];

        // Array to store failures
        const failures: TestItem[] = [];
        // Array to store test items with test field
        const testItems: Array<TestItem & { aiAnswer?: string }> = [];

        // Process each item
        for (const item of testData) {
            // Check addition
            const numbers = item.question.split('+').map(num => parseInt(num.trim(), 10));
            const correctSum = numbers[0] + numbers[1];

            if (correctSum !== item.answer) {
                failures.push(item);
            }

            // Check if item has a test field
            if (item.test) {
                const enhancedItem = { ...item };
                // Ask OpenAI for the answer
                enhancedItem.aiAnswer = await askOpenAI(item.test.q);
                testItems.push(enhancedItem);
            }
        }

        // Send response
        res.json({
            totalItems: testData.length,
            failureCount: failures.length,
            failures: failures,
            testItemsCount: testItems.length,
            testItems: testItems
        });

    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ error: 'Server error processing the file' });
    }
});

app.post('/report-verify', async (req, res) => {
    try {
        const verifyResponse = await fetch('https://c3ntrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "task": "JSON",
                "apikey": process.env.AIDEVS_API_KEY,
                "answer": req.body.answer || {}
            })
        });

        const data = await verifyResponse.json();
        res.json(data);
    } catch (error) {
        console.error('Error verifying with Report:', error);
        res.status(500).json({ error: 'Failed to verify with Report' });
    }
});

// Default route
app.get('/', (req, res) => {
    res.send('Use the /validate endpoint to validate the JSON file');
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Visit http://localhost:3000/validate to check the test data');
});
