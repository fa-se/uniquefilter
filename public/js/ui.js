'use strict';

function renderText(element, text) {
    if (element) {
        element.style.display = text ? 'block' : 'none';
        element.innerText = text || '';
    }
}

function renderOptions(selectElement, items, key, value) {
    if (!selectElement) return;
    const options = items.map(item => {
        const option = document.createElement('option');
        option.value = item[key];
        option.innerHTML = item[value];
        return option;
    });
    selectElement.replaceChildren(...options);
}

export function render(state) {
    const leagueSelect = document.getElementById('league-select');
    const stashSelect = document.getElementById('uniquestash-select');
    const filterSelect = document.getElementById('filter-select');
    const updateFilterButton = document.getElementById('update-filter-button');
    const statusContainer = document.getElementById('status-container');

    // Render dropdowns
    if (leagueSelect.value !== state.league) {
        leagueSelect.value = state.league;
    }
    renderOptions(stashSelect, state.stashes, 'id', 'name');
    stashSelect.value = state.selectedStashId;

    renderOptions(filterSelect, state.filters, 'id', 'filter_name');
    filterSelect.value = state.selectedFilterId;

    // Render button state
    const isStashSelected = !!state.selectedStashId;
    const isFilterSelected = !!state.selectedFilterId;
    updateFilterButton.disabled = state.isLoading || !isStashSelected || !isFilterSelected;

    // Render messages
    statusContainer.innerHTML = ''; // Clear previous messages
    let messageText = null;
    let messageClass = '';

    if (state.rateLimitMessage) {
        messageText = state.rateLimitMessage;
        messageClass = 'status-rate-limit';
    } else if (state.error) {
        messageText = state.error;
        messageClass = 'status-error';
    } else if (state.isLoading || state.infoMessage) {
        messageText = state.infoMessage;
        messageClass = 'status-info';
    }

    if (messageText) {
        const messageElement = document.createElement('div');
        messageElement.className = `status-message ${messageClass}`;
        messageElement.innerText = messageText;
        statusContainer.appendChild(messageElement);
    }
}

export function updateLeagueOptions(leagues) {
    const leagueSelect = document.getElementById('league-select');
    renderOptions(leagueSelect, leagues, 'id', 'id');
}
