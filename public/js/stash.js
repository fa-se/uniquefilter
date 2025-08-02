'use strict';

import poeApi from './poe-api-interface.js';
import { UniqueList } from "./unique.js";
import { withRateLimitHandling } from "./utils.js";

export class Stash {
    constructor(league, id, name, type, index) {
        this.league = league;
        this.id = id;
        this.name = name;
        this.type = type;
        this.index = index;
    }

    async getContainedUniques() {
        let localStorageSavedUniques = window.localStorage.getItem("poe-owned-uniques-" + this.league);
        let items = [];
        if (window.debugAvoidRateLimit && localStorageSavedUniques !== null) {
            items = JSON.parse(localStorageSavedUniques);
        } else {
            const stashDetail = await withRateLimitHandling(() => poeApi.getStashDetail(this.league, this.id));
            const subStashes = new StashList(this.league, stashDetail.stash);
            const subStashIds = subStashes.stashes.map(stash => stash.id);
            const itemChunks = [];

            while (subStashIds.length > 0) {
                // 1. Probe: Fetch the next single tab to get the latest rate-limit headers.
                const probeId = subStashIds.shift();
                if (!probeId) continue;

                const probeDetail = await withRateLimitHandling(() => poeApi.getStashDetail(this.league, `${this.id}/${probeId}`));
                if (probeDetail && probeDetail.stash && probeDetail.stash.items) {
                    itemChunks.push(probeDetail.stash.items);
                } else if (probeDetail && !probeDetail.stash) {
                    console.warn(`Malformed response for stash tab ${probeId}`, probeDetail);
                }

                if (subStashIds.length === 0) break;

                // 2. Evaluate: Check available slots based on the headers from the probe request.
                const rateLimitInfo = JSON.parse(window.localStorage.getItem("rateLimitInfo"))['stash-request-limit'];
                let availableSlots = 0;
                if (rateLimitInfo && rateLimitInfo.limits && rateLimitInfo.state) {
                    const limits = rateLimitInfo.limits.split(',');
                    const states = rateLimitInfo.state.split(',');
                    const availableByRule = limits.map((limit, index) => {
                        const limitParts = limit.split(':');
                        const stateParts = states[index].split(':');
                        return parseInt(limitParts[0], 10) - parseInt(stateParts[0], 10);
                    });
                    availableSlots = Math.max(0, Math.min(...availableByRule));
                }

                // 3. Burst: Create a batch of requests to run in parallel.
                const batchSize = Math.min(subStashIds.length, availableSlots);
                if (batchSize > 0) {
                    const batchIds = subStashIds.splice(0, batchSize);
                    const batchPromises = batchIds.map(id =>
                        withRateLimitHandling(() => poeApi.getStashDetail(this.league, `${this.id}/${id}`))
                    );
                    
                    const batchResults = await Promise.all(batchPromises);

                    batchResults.forEach((detail, index) => {
                        const id = batchIds[index];
                        if (detail && detail.stash && detail.stash.items) {
                            itemChunks.push(detail.stash.items);
                        } else if (detail && !detail.stash) {
                            console.warn(`Malformed response for stash tab ${id}`, detail);
                        }
                    });
                }
            }

            items = itemChunks.flat();
            window.localStorage.setItem("poe-owned-uniques-" + this.league, JSON.stringify(items));
        }

        return new UniqueList(items);
    }
}

export class StashList {
    constructor(league, apiResponse) {
        this.league = league;
        this.stashes = [];
        if (apiResponse.hasOwnProperty('children')) {
            this.#addAllChildren(this.stashes, apiResponse.children);
        }
        // if stash contains no items, apiResponse won't have the stashes property
        else if (apiResponse.hasOwnProperty('stashes')) {
            this.#addAllChildren(this.stashes, apiResponse.stashes)
        }
    }

    getAllUniqueStashes() {
        let map = {};
        this.stashes.forEach(stash => {
            if (stash.type === 'UniqueStash') {
                map[stash.id] = stash;
            }
        });
        return map;
    }

    #addAllChildren(array, stashes) {
        stashes.forEach(element => {
            if (element.type === 'Folder') {
                this.#addAllChildren(array, element.children);
            } else {
                array.push(new Stash(this.league, element.id, element.name, element.type, element.index));
            }
        })
    }
}
