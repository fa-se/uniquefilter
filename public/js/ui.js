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
    const collectionStatsContainer = document.getElementById('collection-stats-container');

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

    // Render primary status message
    let primaryMessage = null;
    let primaryClass = '';

    if (state.rateLimitMessage) {
        primaryMessage = state.rateLimitMessage;
        primaryClass = 'status-rate-limit';
    } else if (state.error) {
        primaryMessage = state.error;
        primaryClass = 'status-error';
    } else if (state.isLoading || state.infoMessage) {
        primaryMessage = state.infoMessage;
        primaryClass = 'status-info';
    }

    if (primaryMessage) {
        const messageElement = document.createElement('div');
        messageElement.className = `status-message ${primaryClass}`;
        messageElement.innerText = primaryMessage;
        statusContainer.appendChild(messageElement);
    }

    // Clear and render collection stats area
    if (collectionStatsContainer) {
        collectionStatsContainer.innerHTML = '';
    }
    
    // Render collection stats if available
    if (state.collectionStats && collectionStatsContainer) {
        const { owned, missing } = state.collectionStats;
        
        const template = document.getElementById('collection-stats-template');
        if (template) {
            const statsArea = template.content.cloneNode(true);
        
            // Populate counts
            statsArea.querySelector('[data-owned-count]').textContent = owned.length;
            statsArea.querySelector('[data-missing-count]').textContent = missing.length;
            
            // Add click handler
            const viewDetailsBtn = statsArea.querySelector('.view-details-btn');
            viewDetailsBtn.addEventListener('click', () => showUniquesBreakdown(state.collectionStats));
            
            collectionStatsContainer.appendChild(statsArea);
        }
    }
}

function showUniquesBreakdown(data) {
    const { owned, missing } = data;
    
    // Clone the template
    const template = document.getElementById('uniques-breakdown-template');
    const modal = template.content.cloneNode(true);
    
    // Populate counts
    modal.querySelectorAll('[data-owned-count]').forEach(el => {
        el.textContent = owned.length;
    });
    modal.querySelectorAll('[data-missing-count]').forEach(el => {
        el.textContent = missing.length;
    });
    
    // Helper function to create grouped list
    const createGroupedList = (uniques, container) => {
        // Group by base type
        const grouped = uniques.reduce((groups, unique) => {
            const baseType = unique.baseType;
            if (!groups[baseType]) {
                groups[baseType] = [];
            }
            groups[baseType].push(unique);
            return groups;
        }, {});

        // Sort base types alphabetically
        const sortedBaseTypes = Object.keys(grouped).sort();

        sortedBaseTypes.forEach(baseType => {
            // Create fieldset-style group
            const fieldset = document.createElement('fieldset');
            fieldset.className = 'base-type-fieldset';
            
            const legend = document.createElement('legend');
            legend.textContent = baseType;
            fieldset.appendChild(legend);
            
            const itemsContainer = document.createElement('div');
            itemsContainer.className = 'base-type-items';
            
            // Sort uniques within the group by name
            const sortedUniques = grouped[baseType].sort((a, b) => a.name.localeCompare(b.name));
            
            sortedUniques.forEach(unique => {
                const item = document.createElement('div');
                item.className = 'item-entry';
                item.innerHTML = `<span class="item-name">${unique.name}</span>`;
                itemsContainer.appendChild(item);
            });
            
            fieldset.appendChild(itemsContainer);
            container.appendChild(fieldset);
        });
    };

    // Populate owned list
    const ownedList = modal.querySelector('[data-owned-list]');
    createGroupedList(owned, ownedList);
    
    // Populate missing list
    const missingList = modal.querySelector('[data-missing-list]');
    createGroupedList(missing, missingList);
    
    // Add to DOM
    document.body.appendChild(modal);
    
    // Get the modal elements (now in DOM)
    const overlay = document.querySelector('.modal-overlay');
    const closeButton = overlay.querySelector('.close-button');
    
    // Close handlers
    const closeModal = () => document.body.removeChild(overlay);
    
    closeButton.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
    
    // ESC key handler
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}

export function updateLeagueOptions(leagues) {
    const leagueSelect = document.getElementById('league-select');
    renderOptions(leagueSelect, leagues, 'id', 'id');
}
