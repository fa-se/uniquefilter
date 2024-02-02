'use strict';

import {allDropEnabledUniques} from "../json/drop-enabled-uniques.js";
import {allGlobalDropEnabledUniques} from "../json/global-drop-enabled-uniques.js";

export class Unique {
    constructor(name, baseType) {
        this.name = name;
        this.baseType = baseType;
    }
}

export class UniqueList {
    /**
     *
     * @param uniques array of items as returned by the poe api
     */
    constructor(uniques) {
        this.uniques = [];
        this.uniquesMap = new Map();

        for (let unique of uniques) {
            this.uniques.push(new Unique(unique.name, unique.baseType));
            // we need to keep track of unique counts to correctly deal with uniques with variants, which share name and base type
            if (!this.uniquesMap.has(unique.name)) {
                this.uniquesMap.set(unique.name, 1);
            } else {
                this.uniquesMap.set(unique.name, this.uniquesMap.get(unique.name) + 1);
            }
        }
    }

    getMissingUniques(globalOnly = false) {
        let missingUniques = [];
        /*
         list of all (global) drop-enabled uniques
         obtained from https://www.poewiki.net/index.php?title=Special:CargoExport&tables=items&fields=items.name,items.base_item&where=items.rarity_id=%22unique%22+AND+items.drop_enabled=true+AND+items.is_drop_restricted=false&limit=2000&format=json
        */
        let uniqueList = globalOnly ? allGlobalDropEnabledUniques : allDropEnabledUniques;

        // unfortunately, because the unique stash treats multi-variant uniques inconsistently, we have to explicitly define rules for some uniques
        let inconsistentUniques = new Set(
            ["Yriel's Fostering",       // has multiple variants, but only one slot in the stash
                "The Dark Seer",                // has multiple variants, but only one slot in the stash
                "Wurm's Molt"]);            // doesn't have variants, but multiple versions returned from wiki query because https://www.poewiki.net/wiki/User:Balaar/sandbox/testcases/Wurm%27s_Molt

        // for each possible unique, check if it is present in this instance of UniqueList and collect missing uniques
        for (let unique of uniqueList) {
            let uniqueCount = this.uniquesMap.get(unique.name);
            if (uniqueCount === undefined || uniqueCount === 0) {
                missingUniques.push(new Unique(unique.name, unique["base item"]));
            }
            // decrement unique counter to keep track of uniques with multiple variants
            if(!inconsistentUniques.has(unique.name)){
                this.uniquesMap.set(unique.name, uniqueCount - 1);
            }
        }

        return missingUniques;
    }
}