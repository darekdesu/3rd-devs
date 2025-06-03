// services/ReportService.ts
import axios from 'axios';

export class ReportService {
    private apiUrl: string;
    private apiKey: string;

    constructor(apiUrl: string, apiKey: string) {
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
    }

    /**
     * Send a report to the API
     * @param task Task identifier
     * @param answer The data to send
     * @returns The API response
     */
    async sendReport(task: string, answer: string): Promise<any> {
        if (!this.apiKey) {
            throw new Error('AIDEVS_API_KEY is not set!');
        }
        try {
            const payload = {
                task,
                apikey: this.apiKey,
                answer
            };
            console.log('Sending report payload:', payload); // DEBUG
            const response = await axios.post(this.apiUrl, payload, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            return response.data;
        } catch (error: any) {
            if (error.response) {
                console.error('Error sending report:', error.response.status, error.response.data);
            } else {
                console.error('Error sending report:', error.message);
            }
            throw error;
        }
    }
}
