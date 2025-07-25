'use strict';

export const appState = {
    league: 'Standard',
    stashes: [],
    filters: [],
    selectedStashId: null,
    selectedFilterId: null,
    isLoading: false,
    error: null,
    infoMessage: null,
    rateLimitMessage: null,
};

export function setState(newState) {
    Object.assign(appState, newState);
}
