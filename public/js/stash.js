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
            for (const id of subStashIds) {
                const detail = await withRateLimitHandling(() => poeApi.getStashDetail(this.league, `${this.id}/${id}`));
                if (detail && detail.stash && detail.stash.items) {
                    itemChunks.push(detail.stash.items);
                } else {
                    console.warn(`No items found or malformed response for stash tab ${id}`, detail);
                }
            }
            
            items = itemChunks.flat();

            // save result to local storage to allow avoiding running into rate limit by using stale data for debug purposes
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
