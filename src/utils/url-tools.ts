import { SearchResult } from '../types';

export function normalizeUrl(urlString: string, debug = false): string {
  if (!urlString?.trim()) {
    throw new Error('Empty URL');
  }

  urlString = urlString.trim();

  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(urlString)) {
    urlString = 'https://' + urlString;
  }

  try {
    const url = new URL(urlString);

    url.hostname = url.hostname.toLowerCase();
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
    }

    if (
      (url.protocol === 'http:' && url.port === '80') ||
      (url.protocol === 'https:' && url.port === '443')
    ) {
      url.port = '';
    }

    // Path normalization with error tracking
    url.pathname =
      url.pathname
        .split('/')
        .map((segment) => {
          try {
            return decodeURIComponent(segment);
          } catch (e) {
            if (debug)
              console.error(`Failed to decode path segment: ${segment}`, e);
            return segment;
          }
        })
        .join('/')
        .replace(/\/+/g, '/')
        .replace(/\/+$/, '') || '/';

    // Query parameter normalization with error details
    const searchParams = new URLSearchParams(url.search);
    const sortedParams = Array.from(searchParams.entries())
      .map(([key, value]) => {
        if (value === '') return [key, ''];
        try {
          const decodedValue = decodeURIComponent(value);
          if (encodeURIComponent(decodedValue) === value) {
            return [key, decodedValue];
          }
        } catch (e) {
          if (debug)
            console.error(`Failed to decode query param ${key}=${value}`, e);
        }
        return [key, value];
      })
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .filter(([key]) => key !== '');

    url.search = new URLSearchParams(sortedParams).toString();

    // Fragment handling with validation
    if (
      url.hash === '#' ||
      url.hash === '#top' ||
      url.hash === '#/' ||
      !url.hash
    ) {
      url.hash = '';
    } else if (url.hash) {
      try {
        const decodedHash = decodeURIComponent(url.hash.slice(1));
        const encodedBack = encodeURIComponent(decodedHash);
        // Only use decoded version if it's safe
        if (encodedBack === url.hash.slice(1)) {
          url.hash = '#' + decodedHash;
        }
      } catch (e) {
        if (debug) console.error(`Failed to decode fragment: ${url.hash}`, e);
      }
    }

    let normalizedUrl = url.toString();

    // Final URL normalization with validation
    try {
      const decodedUrl = decodeURIComponent(normalizedUrl);
      const encodedBack = encodeURIComponent(decodedUrl);
      // Only use decoded version if it's safe
      if (encodedBack === normalizedUrl) {
        normalizedUrl = decodedUrl;
      }
    } catch (e) {
      if (debug) console.error('Failed to decode final URL', e);
    }

    return normalizedUrl;
  } catch (error) {
    // Main URL parsing error - this one we should throw
    throw new Error(`Invalid URL "${urlString}": ${error}`);
  }
}

export function getUnvisitedURLs(
  allURLs: Record<string, SearchResult>,
  visitedURLs: string[],
): SearchResult[] {
  return Object.entries(allURLs)
    .filter(([url]) => !visitedURLs.includes(url))
    .map(([, result]) => result);
}
