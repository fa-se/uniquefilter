"use strict";
import poeApi from "./poe-api-interface.js";
import {Filter} from "./filter.js"

window.debugAvoidRateLimit = false; // flag to avoid running into poe api rate limit, for example by using stale data

if (document.readyState !== "loading") {
    main();
} else {
    document.addEventListener("DOMContentLoaded", main);
}

async function main() {
    if(!poeApi.isReady()){
        return;
    }
    setupEventListeners();
    prepareInput();

    let selectedLeague = document.getElementById('league-select').value;
    let accountStashes = await poeApi.getAccountStashes(selectedLeague);
    let uniqueStashes = accountStashes.getAllUniqueStashes();
    fillStashSelect(uniqueStashes);
    await fillFilterSelect();
    // manually trigger change event
    selectValueChanged();

    async function fillFilterSelect(){
        let filterSelect = document.getElementById('filter-select');
        let filters = await poeApi.getAccountItemFilters();

        let options = [];
        for(let filter of filters){
            let option = document.createElement('option');
            option.value = filter.id;
            option.innerHTML = filter.filter_name;
            options.push(option);
        }

        filterSelect.replaceChildren(... options);
    }


    function setupEventListeners() {
        let leagueSelect = document.getElementById('league-select');
        let stashSelect = document.getElementById('uniquestash-select');
        let filterSelect = document.getElementById('filter-select');

        let customStyleCheckbox = document.getElementById('custom-style-cb');
        let customStyleTextArea = document.getElementById('custom-style-textarea');

        let globalDropsOnlyCheckbox = document.getElementById('only-global-drops-cb');

        let updateFilterButton = document.getElementById('update-filter-button');


        leagueSelect.addEventListener('change', (event) => {
            poeApi.getAccountStashes(event.target.value)
                .then((accountStashes) => {
                    uniqueStashes = accountStashes.getAllUniqueStashes();
                    fillStashSelect(uniqueStashes);
                });
        });

        globalDropsOnlyCheckbox.addEventListener('change', (event) => {
            window.localStorage.setItem("only-global-drops", event.target.checked);
        })

        customStyleCheckbox.addEventListener('change', (event => {
            customStyleTextArea.disabled = !event.target.checked;
        }));
        customStyleTextArea.addEventListener('change', () => {
            window.localStorage.setItem("custom-rule-style", customStyleTextArea.value);
        });

        updateFilterButton.addEventListener('click', updateFilter);
        stashSelect.addEventListener('change', selectValueChanged);
        filterSelect.addEventListener('change', selectValueChanged);
    }

    async function updateFilter(){
        let updateFilterButton = document.getElementById('update-filter-button');
        let stashSelect = document.getElementById('uniquestash-select');
        let filterSelect = document.getElementById('filter-select');
        let customStyleCheckbox = document.getElementById('custom-style-cb');
        let customStyleTextArea = document.getElementById('custom-style-textarea');

        let globalDropsOnly = document.getElementById('only-global-drops-cb').checked;

        updateFilterButton.disabled = true;
        let info = document.getElementById('info');
        info.innerText = "loading stash tab contents...";

        let selectedStash = uniqueStashes[stashSelect.value];
        let selectedFilter = filterSelect.value;
        let containedUniques = await selectedStash.getContainedUniques();
        let missingUniques = containedUniques.getMissingUniques(globalDropsOnly);
        console.log(missingUniques); // print because the list itself might be useful to users
        info.innerText = "updating filter...";

        let filter = new Filter(await poeApi.getItemFilter(selectedFilter));
        if(customStyleCheckbox.checked){
            filter.setCustomStyle(customStyleTextArea.value);
        }
        let result = await filter.updateRulesForMissingUniques(missingUniques);

        if(result.error){
            console.log(result);
            info.innerText = result.error.message;
        }
        else{
            info.innerText = "filter successfully updated";
        }
        updateFilterButton.disabled = false;
        }
    }

function fillStashSelect(uniqueStashes){
    let stashSelect = document.getElementById('uniquestash-select');
    let options = [];

    Object.values(uniqueStashes).forEach(stash => {
        let option = document.createElement('option');
        option.value = stash.id;
        option.innerHTML = stash.name;
        options.push(option);
    });
    stashSelect.replaceChildren(... options);
}
function selectValueChanged(){
    let stashSelect = document.getElementById('uniquestash-select');
    let filterSelect = document.getElementById('filter-select');
    let updateFilterButton = document.getElementById('update-filter-button');

    let isStashSelected = stashSelect.value !== '';
    let isFilterSelected = filterSelect.value !== '';
    updateFilterButton.disabled = (!isStashSelected || !isFilterSelected);
}

function prepareInput(){
    let customStyleCheckbox = document.getElementById('custom-style-cb');
    let customStyleTextArea = document.getElementById('custom-style-textarea');
    let globalDropsOnlyCheckbox = document.getElementById('only-global-drops-cb');

    globalDropsOnlyCheckbox.checked = window.localStorage.getItem("only-global-drops") === "true";

    customStyleTextArea.value = window.localStorage.getItem("custom-rule-style");

    let hasCustomStyle = customStyleTextArea.value !== '';
    customStyleCheckbox.checked = hasCustomStyle;
    customStyleTextArea.disabled = !hasCustomStyle;
}