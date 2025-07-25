"use strict";
import poeApi, { RateLimitError } from "./poe-api-interface.js";
import { appState, setState } from "./state.js";
import { render } from "./ui.js";

const wait = (seconds = 1) => new Promise((r) => setTimeout(r, seconds * 1000));

export async function withRateLimitHandling(apiCall) {
    try {
        return await apiCall();
    } catch (e) {
        if (e instanceof RateLimitError) {
            // The PoeApi class will globally pause all new requests.
            // We just need to handle the UI and the retry for this specific call.
            poeApi.constructor.isPaused = true;

            for (let i = e.timeToWait; i > 0; i--) {
                setState({ rateLimitMessage: `Rate limited. Waiting for ${i} seconds...` });
                render(appState);
                await wait(1);
            }

            poeApi.constructor.isPaused = false;
            setState({ rateLimitMessage: null });
            render(appState);
            
            // Retry the call
            return withRateLimitHandling(apiCall);
        }
        // Re-throw other errors
        throw e;
    }
}
