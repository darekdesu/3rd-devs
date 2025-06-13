import express from 'express';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

// Initialize Express app
const app = express();
const PORT = 3000;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Endpoint to process map images
app.get('/process', async (req, res) => {
  try {
    const mapsDir = path.join(__dirname, 'maps');
    const mapFiles = fs.readdirSync(mapsDir).filter(file =>
      file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')
    );

    if (mapFiles.length === 0) {
      return res.status(404).json({ error: 'No map images found' });
    }

    console.log(`Found ${mapFiles.length} map images to process`);

    // Process each map image with GPT-4o
    const cityGuesses = await Promise.all(
      mapFiles.map(async (file) => {
        const filePath = path.join(mapsDir, file);
        const imageBuffer = fs.readFileSync(filePath);
        const base64Image = imageBuffer.toString('base64');

        console.log(`Processing image: ${file}`);

        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are an AI assistant specialized in identifying cities from map images. Given a map image, identify what city it depicts. Respond with only the city name, nothing else.'
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'What city is shown in this map? Respond with just the name of the city, nothing else.' },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
              ]
            }
          ],
          max_tokens: 50
        });

        const cityName = response.choices[0].message.content?.trim();
        console.log(`Image ${file} identified as: ${cityName}`);

        return cityName;
      })
    );

    // Count occurrences of each city name
    const cityCounts = cityGuesses.reduce((acc, city) => {
      if (city) {
        acc[city] = (acc[city] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    // Find the most common city
    let mostCommonCity = '';
    let highestCount = 0;

    for (const [city, count] of Object.entries(cityCounts)) {
      if (count > highestCount) {
        mostCommonCity = city;
        highestCount = count;
      }
    }

    // Return results
    res.json({
      result: mostCommonCity,
      confidence: highestCount / mapFiles.length,
      allGuesses: cityGuesses,
      counts: cityCounts
    });

  } catch (error) {
    console.error('Error processing maps:', error);
    res.status(500).json({ error: 'Failed to process map images' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Use the /process endpoint to analyze map images');
});
