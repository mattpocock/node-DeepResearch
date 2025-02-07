import https from 'https';
import { TokenTracker } from "../utils/token-tracker";
import { SearchResponse } from '../types';
import { JINA_API_KEY } from "../config";

export function search(query: string, tracker?: TokenTracker): Promise<{ response: SearchResponse, tokens: number }> {
  return new Promise((resolve, reject) => {
    if (!query.trim()) {
      reject(new Error('Query cannot be empty'));
      return;
    }

    const options = {
      hostname: 's.jina.ai',
      port: 443,
      path: `/${encodeURIComponent(query)}?count=0`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${JINA_API_KEY}`,
        'X-Retain-Images': 'none'
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => responseData += chunk);

      res.on('end', () => {
        // Check HTTP status code first
        if (res.statusCode && res.statusCode >= 400) {
          try {
            // Try to parse error message from response if available
            const errorResponse = JSON.parse(responseData);
            if (res.statusCode === 402) {
              reject(new Error(errorResponse.readableMessage || 'Insufficient balance'));
              return;
            }
            reject(new Error(errorResponse.readableMessage || `HTTP Error ${res.statusCode}`));
          } catch {
            // If parsing fails, just return the status code
            reject(new Error(`HTTP Error ${res.statusCode}`));
          }
          return;
        }

        // Only parse JSON for successful responses
        let response: SearchResponse;
        try {
          response = JSON.parse(responseData) as SearchResponse;
        } catch (error: unknown) {
          reject(new Error(`Failed to parse response: ${error instanceof Error ? error.message : 'Unknown error'}`));
          return;
        }

        if (!response.data || !Array.isArray(response.data)) {
          reject(new Error('Invalid response format'));
          return;
        }

        const totalTokens = response.data.reduce((sum, item) => sum + (item.usage?.tokens || 0), 0);
        console.log('Total URLs:', response.data.length);

        const tokenTracker = tracker || new TokenTracker();
        tokenTracker.trackUsage('search', totalTokens);

        resolve({ response, tokens: totalTokens });
      });
    });

    // Add timeout handling
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.end();
  });
}