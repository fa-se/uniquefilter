'use strict';

import {allDropEnabledUniques} from "../json/drop-enabled-uniques.js";

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

    getMissingUniques(){
        let missingUniques = [];

        for (let unique of allDropEnabledUniques){
            let uniqueIdx = this.uniqesMap.get(unique.name);
            if(uniqueIdx === undefined){
                missingUniques.push(new Unique(unique.name, unique.baseType));
            }
        }

        return missingUniques;
    }
}