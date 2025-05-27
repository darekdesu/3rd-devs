import express from 'express';
import dotenv from 'dotenv';
import { CensorService } from './CensorService';
import { ReportService } from '../services/ReportService';

// Load environment variables
dotenv.config();

// Initialize services
const API_KEY = process.env.AIDEVS_API_KEY || '';
if (!API_KEY) {
    console.error('API_KEY environment variable is required');
    process.exit(1);
}

const reportService = new ReportService('https://c3ntrala.ag3nts.org/report', API_KEY);
const censorService = new CensorService(`https://c3ntrala.ag3nts.org/data/${API_KEY}/cenzura.txt`);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// Endpoint to process censorship task
app.get('/process-censorship', async (req, res) => {
    try {
        // 1. Fetch the data
        const originalData = await censorService.fetchData();

        // 2. Censor the data
        const censoredData = censorService.censorData(originalData);

        console.log('Censored Data:', censoredData);

        // 3. Send the censored data to the reporting API
        const result = await reportService.sendReport('CENZURA', censoredData);

        // 4. Return the result
        res.status(200).json({
            success: true,
            originalData,
            censoredData,
            apiResponse: result
        });
    } catch (error) {
        console.error('Error processing censorship task:', error instanceof Error ? error.message : 'No error message');
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
