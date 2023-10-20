'use strict';

import {allDropEnabledUniques} from "../json/drop-enabled-uniques.js";
import {allGlobalDropEnabledUniques} from "../json/global-drop-enabled-uniques.js";

export class Unique{
    constructor(name, baseType) {
        this.name = name;
        this.baseType = baseType;
    }
}

export class UniqueList{
    /**
     *
     * @param uniques array of items as returned by the poe api
     */
    constructor(uniques){
        this.uniques = [];
        this.uniqesMap = new Map();

        let currentIndex = 0;
        for(let unique of uniques){
            this.uniques.push(new Unique(unique.name, unique.baseType));
            this.uniqesMap.set(unique.name, currentIndex);
            currentIndex++;
        }
    }

    getMissingUniques(globalOnly = false){
        let missingUniques = [];
        
        let uniqueList = globalOnly ? allGlobalDropEnabledUniques : allDropEnabledUniques;

        for (let unique of uniqueList){
            let uniqueIdx = this.uniqesMap.get(unique.name);
            if(uniqueIdx === undefined){
                missingUniques.push(new Unique(unique.name, unique["base item"]));
            }
        }

        return missingUniques;
    }
}