const API_URL = 'http://localhost:8000/api/event';

async function postEvent(event, payload = {}) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event,
        timestamp: Date.now(),
        ...payload,
      }),
    });

    if (!response.ok) {
      console.warn('API request failed:', response.status);
    }

    return response;
  } catch (error) {
    console.error('API request error:', error);
    return null;
  }
}
