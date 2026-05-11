"use strict";
import { RateLimitError, setPaused } from "./rate-limit.js";
import { appState, setState } from "./state.js";
import { render } from "./ui.js";

const wait = (seconds = 1) => new Promise((r) => setTimeout(r, seconds * 1000));

export async function withRateLimitHandling(apiCall) {
    try {
        return await apiCall();
    } catch (e) {
        if (e instanceof RateLimitError) {
            // Pause all new requests globally; the request loop in poe-api-interface
            // polls this flag.
            setPaused(true);

            for (let i = e.timeToWait; i > 0; i--) {
                setState({ rateLimitMessage: `Rate limited. Waiting for ${i} seconds...` });
                render(appState);
                await wait(1);
            }

            setPaused(false);
            setState({ rateLimitMessage: null });
            render(appState);

            // Retry the call
            return withRateLimitHandling(apiCall);
        }
        // Re-throw other errors
        throw e;
    }
}
