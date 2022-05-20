'use strict';
import poeApi from "./poe-api-interface.js";

export class Filter{
    constructor(apiResponse){
        this.name = apiResponse.filter_name;
        this.id = apiResponse.id;
        this.description = apiResponse.description;
        this.filter = apiResponse.filter;
        this.version = apiResponse.version;
    }

    async updateRulesForMissingUniques(uniques){
        let ruleString = this.#generateMissingUniquesRule(uniques);
        this.#insertMissingUniquesRule(ruleString);
        this.#updateVersionAndDescription();
        return await this.#uploadFilter();
    }

    #generateMissingUniquesRule(uniques){
        let baseTypes = [... new Set(uniques.map( unique => unique.baseType))];
        let baseTypeString = "";
        for(const baseType of baseTypes){
            baseTypeString += '"' + baseType + '" ';
        }

        let rule =
            `Show
                Rarity == Unique
                BaseType ${baseTypeString}
                SetTextColor 0 0 255
                SetBorderColor 255 255 255 255
                SetBackgroundColor 255 109 0 255
                SetFontSize 45
                PlayAlertSound 10 300
                MinimapIcon 0 Orange Cross
                PlayEffect Orange\n`;

        return rule;
    }

    #insertMissingUniquesRule(ruleString){
        let segmentStart = "#=========================================== uniquefilter.dev - start ==========================================\n";
        let segmentEnd = "#============================================ uniquefilter.dev - end ===========================================\n\n";

        let startIndex = this.filter.indexOf(segmentStart);
        let endIndex = this.filter.indexOf(segmentEnd) + segmentEnd.length;

        let priorSegment = "";
        let ruleSegment = segmentStart + ruleString + segmentEnd;
        let posteriorSegment = "";

        // if the start pattern has not been found(because this filter didnt have the corresponding rule before),
        // insert at the beginning
        if(startIndex === -1){
            posteriorSegment = this.filter;
        }
        // start pattern was found, but end pattern was not? error!
        else if(endIndex === -1){
            throw "missing end segment during rule generation";
        }
        // start and end pattern found
        else{
            priorSegment = this.filter.substring(0, startIndex);
            posteriorSegment = this.filter.substring(endIndex);
        }

        this.filter = priorSegment + ruleSegment + posteriorSegment;
    }

    async #uploadFilter(){
        let response = await poeApi.updateItemFilter(this);
        return response;
    }

    #updateVersionAndDescription() {
        let versionSuffix = '.uq';
        if(!this.version.endsWith(versionSuffix)){
            this.version += versionSuffix;
        }

        let descriptionSuffix = '\nModified by uniquefilter.dev';
        if(!this.description.endsWith(descriptionSuffix)){
            this.description += descriptionSuffix;
        }
    }
}