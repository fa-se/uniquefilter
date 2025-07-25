'use strict';

export const appState = {
    league: window.localStorage.getItem('league') || 'Standard',
    stashes: [],
    filters: [],
    selectedStashId: window.localStorage.getItem('selectedStashId') || null,
    selectedFilterId: window.localStorage.getItem('selectedFilterId') || null,
    isLoading: false,
    error: null,
    infoMessage: null,
    rateLimitMessage: null,
};

export function setState(newState) {
    Object.assign(appState, newState);
}
