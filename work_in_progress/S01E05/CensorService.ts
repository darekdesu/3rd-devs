// services/CensorService.ts
import axios from 'axios';

export class CensorService {
    private dataUrl: string;

    constructor(dataUrl: string) {
        this.dataUrl = dataUrl;
    }

    /**
     * Fetch data from the source URL
     * @returns The fetched data as string
     */
    async fetchData(): Promise<string> {
        try {
            const response = await axios.get(this.dataUrl);
            return response.data;
        } catch (error) {
            console.error('Error fetching data:', error);
            throw new Error('Failed to fetch data');
        }
    }

    /**
     * Censor personal information in the text
     * @param text Input text to censor
     * @returns Censored text
     */
    censorData(text: string): string {
        // Regex patterns for identifying personal information
        const namePattern = /([A-Z][a-z]+ [A-Z][a-z]+)/g;
        const agePattern = /(\d+) (lat(a)?)/g;
        const cityPattern = /([A-Z][a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+(?:[ -][A-Z][a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)*)/g;
        const streetPattern = /(ul\. [A-Z][a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+ \d+)/g;

        // Replace with censored text
        let censoredText = text;

        // Censor names
        censoredText = censoredText.replace(namePattern, 'CENZURA');

        // Censor ages
        censoredText = censoredText.replace(agePattern, (match, age, suffix) => {
            return `CENZURA ${suffix}`;
        });

        // Find and censor city names, but be careful with context
        censoredText = censoredText.replace(/(Adres: )([A-Z][a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+(?:[ -][A-Z][a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)*)/g, '$1CENZURA');

        // Censor street addresses
        censoredText = censoredText.replace(streetPattern, 'ul. CENZURA');

        return censoredText;
    }
}
