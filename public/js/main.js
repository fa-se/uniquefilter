"use strict";
import poeApi from "./poe-api-interface.js";
import { PoeApiAuth } from "./poe-api-auth.js";
import { Filter } from "./filter.js";
import { appState, setState } from "./state.js";
import { render, updateLeagueOptions } from "./ui.js";
import { withRateLimitHandling } from "./utils.js";

async function handleLeagueChange(league) {
    setState({ league: league, isLoading: true, infoMessage: 'Fetching stashes...', error: null });
    render(appState);

    try {
        const accountStashes = await withRateLimitHandling(() => poeApi.getAccountStashes(league));
        const uniqueStashes = accountStashes.getAllUniqueStashes();
        setState({ stashes: Object.values(uniqueStashes), selectedStashId: uniqueStashes[0]?.id, isLoading: false, infoMessage: null });
    } catch (error) {
        setState({ isLoading: false, error: 'Failed to fetch stashes.' });
        console.error(error);
    }
    render(appState);
}

async function handleUpdateFilter() {
    setState({ isLoading: true, infoMessage: 'Loading stash tab contents...', error: null });
    render(appState);

    try {
        const selectedStash = appState.stashes.find(s => s.id === appState.selectedStashId);
        // The rate limit handling is now done inside getContainedUniques
        const containedUniques = await selectedStash.getContainedUniques();
        
        console.log("owned uniques: ", containedUniques.uniquesMap);
        const globalDropsOnly = document.getElementById('only-global-drops-cb').checked;
        const missingUniques = containedUniques.getMissingUniques(globalDropsOnly);
        console.log("missing uniques: ", missingUniques);

        setState({ infoMessage: 'Updating filter...' });
        render(appState);

        const filterData = await withRateLimitHandling(() => poeApi.getItemFilter(appState.selectedFilterId));
        const filter = new Filter(filterData);

        const customStyleTextArea = document.getElementById('custom-style-textarea');
        if (customStyleTextArea.value.trim() !== '') {
            filter.setCustomStyle(customStyleTextArea.value);
        }

        const result = await filter.updateRulesForMissingUniques(missingUniques);

        if (result.error) {
            throw new Error(result.error.message);
        }
        
        setState({ isLoading: false, infoMessage: 'Filter successfully updated!' });

    } catch (error) {
        setState({ isLoading: false, error: `Error: ${error.message}` });
        console.error(error);
    }
    render(appState);
}

function setupEventListeners() {
    document.getElementById('league-select').addEventListener('change', (event) => {
        window.localStorage.setItem('league', event.target.value);
        handleLeagueChange(event.target.value);
    });
    document.getElementById('uniquestash-select').addEventListener('change', (event) => {
        window.localStorage.setItem('selectedStashId', event.target.value);
        setState({ selectedStashId: event.target.value });
        render(appState);
    });
    document.getElementById('filter-select').addEventListener('change', (event) => {
        window.localStorage.setItem('selectedFilterId', event.target.value);
        setState({ selectedFilterId: event.target.value });
        render(appState);
    });
    document.getElementById('update-filter-button').addEventListener('click', handleUpdateFilter);

    // --- Other event listeners that don't trigger re-renders can stay simple ---
    document.getElementById('only-global-drops-cb').addEventListener('change', (event) => {
        window.localStorage.setItem("only-global-drops", event.target.checked);
    });
    const customStyleTextArea = document.getElementById('custom-style-textarea');
    customStyleTextArea.addEventListener('change', () => {
        window.localStorage.setItem("custom-rule-style", customStyleTextArea.value);
    });
}

function prepareLegacyInput() {
    const customStyleTextArea = document.getElementById('custom-style-textarea');
    const globalDropsOnlyCheckbox = document.getElementById('only-global-drops-cb');

    globalDropsOnlyCheckbox.checked = window.localStorage.getItem("only-global-drops") === "true";
    customStyleTextArea.value = window.localStorage.getItem("custom-rule-style") || '';
}

function cleanupOldLocalStorageEntries() {
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('poe-owned-uniques-')) {
            localStorage.removeItem(key);
            console.log(`Removed deprecated localStorage entry: ${key}`);
        }
    }
}

async function main() {
    cleanupOldLocalStorageEntries();
    PoeApiAuth.handleAuthorization();

    if (!poeApi.isReady()) {
        return;
    }
    
    setupEventListeners();
    prepareLegacyInput();

    setState({ isLoading: true, infoMessage: 'Fetching initial data...', error: null });
    render(appState);

    try {
        const [leagues, stashes, filters] = await Promise.all([
            withRateLimitHandling(() => poeApi.getLeagues()),
            withRateLimitHandling(() => poeApi.getAccountStashes(appState.league)),
            withRateLimitHandling(() => poeApi.getAccountItemFilters())
        ]);

        updateLeagueOptions(leagues);
        
        const uniqueStashes = Object.values(stashes.getAllUniqueStashes());
        const uniqueStashIds = new Set(uniqueStashes.map(s => s.id));
        const filterIds = new Set(filters.map(f => f.id));

        setState({
            stashes: uniqueStashes,
            filters: filters,
            selectedStashId: appState.selectedStashId && uniqueStashIds.has(appState.selectedStashId) 
                ? appState.selectedStashId 
                : uniqueStashes[0]?.id,
            selectedFilterId: appState.selectedFilterId && filterIds.has(appState.selectedFilterId)
                ? appState.selectedFilterId
                : filters[0]?.id,
            isLoading: false,
            infoMessage: null
        });
    } catch (error) {
        setState({ isLoading: false, error: 'Failed to fetch initial data.' });
        console.error(error);
    }
    
    render(appState);
}

if (document.readyState !== "loading") {
    main();
} else {
    document.addEventListener("DOMContentLoaded", main);
}
