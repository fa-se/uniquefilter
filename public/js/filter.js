'use strict';
import poeApi, {PoeApiError} from "./poe-api-interface.js";

// Shown when PoE rejects lines outside our block. The usual cause is a base filter
// written for the previous game version: new leagues add, rename and remove base
// types, and PoE validates the whole filter on upload.
const BASE_FILTER_HINT =
	'PoE rejected lines in your base filter, outside the uniquefilter.dev block. ' +
	'After a new league or game patch this usually means the filter still uses base types from the previous version. ' +
	'Update the base filter first. If you use FilterBlade, load the filter there and save it again ' +
	'(once FilterBlade supports the current patch), then run the update here again.';

const OWN_BLOCK_HINT =
	'PoE rejected lines inside the uniquefilter.dev block. ' +
	'If you set a custom style, check it for typos: every line must be a valid filter action such as "SetFontSize 45". ' +
	'If you use the default style, please report this error.';

export class Filter {
	constructor(apiResponse) {
		this.name = apiResponse.filter_name;
		this.id = apiResponse.id;
		this.description = apiResponse.description;
		this.customStyle = '';
		this.filter = apiResponse.filter;
		this.version = apiResponse.version;
	}

	// 1-based, inclusive line range of our block in this.filter, set by
	// #insertMissingUniquesRule. Used to locate PoE's validation errors.
	#ruleLineRange = null;

	setCustomStyle(styleText) {
		styleText = this.#sanitizeStyleText(styleText);
		this.customStyle = styleText;
	}

	async updateRulesForMissingUniques(uniques) {
		let ruleString = this.#generateMissingUniquesRule(uniques);
		this.#insertMissingUniquesRule(ruleString);
		this.#updateVersionAndDescription();
		let response;
		try {
			response = await this.#uploadFilter();
		} catch (error) {
			if (error instanceof PoeApiError && error.status === 400) {
				error.hint = this.#validationHint(error.poeError);
			}
			throw error;
		}
		return Filter.#interpretUploadResponse(response);
	}

	// PoE reports validation failures as "Line N: ..." in error.message (older format,
	// "...; filter : Line N : ...") or in error.fields[].message. Line numbers decide
	// whose problem it is: outside our block it's the user's base filter, inside it's
	// the custom style or our generated rule. Returns null when no line is named.
	#validationHint(poeError) {
		if (!poeError || !this.#ruleLineRange) return null;
		const texts = [poeError.message, ...(Array.isArray(poeError.fields) ? poeError.fields.map(f => f?.message) : [])]
			.filter(t => typeof t === 'string');
		const lines = texts.flatMap(t => [...t.matchAll(/\bLine (\d+)/g)].map(m => Number(m[1])));
		if (lines.length === 0) return null;
		const {start, end} = this.#ruleLineRange;
		const hints = [];
		if (lines.some(l => l < start || l > end)) hints.push(BASE_FILTER_HINT);
		if (lines.some(l => l >= start && l <= end)) hints.push(OWN_BLOCK_HINT);
		return hints.join('\n\n');
	}

	// Normalize PoE's filter-update response into a tagged status. The 'delayed' path
	// is a 200 carrying {error: {message: "...updated multiple times in the last 10
	// minutes, there will be a delay before your most recent changes can be synced to
	// the game client"}}. Despite the `error` key, PoE has accepted and stored the
	// upload — only the push to the game client is deferred. Recognizable only by text
	// because PoE doesn't expose a distinct code for it. A genuine rejection comes back
	// as a non-2xx, which ensureOk() in poe-api-interface.js throws (with PoE's error
	// text) before this runs; the 'error' branch only covers a 2xx with an unknown error.
	static #interpretUploadResponse(response) {
		if (!response || !response.error) {
			return { status: 'success' };
		}
		const message = response.error.message ?? 'Filter update failed';
		if (typeof message === 'string' && message.includes('updated multiple times in the last 10 minutes')) {
			return { status: 'delayed', message };
		}
		return { status: 'error', message };
	}

	#generateMissingUniquesRule(uniques) {
		let baseTypes = [...new Set(uniques.map(unique => unique.baseType))];
		let baseTypeString = "";
		for (const baseType of baseTypes) {
			baseTypeString += '"' + baseType + '" ';
		}

		let useDefaultStyle = (this.customStyle === '');

		let style = useDefaultStyle ?
			`	SetTextColor 0 0 255
	SetBorderColor 255 255 255 255
	SetBackgroundColor 255 109 0 255
	SetFontSize 45
	PlayAlertSound 10 300
	MinimapIcon 0 Orange Cross
	PlayEffect Orange`
			:
			this.customStyle;

		return `Show
	Rarity == Unique
	BaseType == ${baseTypeString}
${style}\n`;
	}

	#insertMissingUniquesRule(ruleString) {
		let segmentStart = "#=========================================== uniquefilter.dev - start ==========================================\n";
		let segmentEnd = "#============================================ uniquefilter.dev - end ===========================================\n\n";

		let startIndex = this.filter.indexOf(segmentStart);
		let endIndex = this.filter.indexOf(segmentEnd);
		if (endIndex !== -1) {
			endIndex += segmentEnd.length;
		}

		let priorSegment = "";
		let ruleSegment = segmentStart + ruleString + segmentEnd;
		let posteriorSegment = "";

		// if the start pattern has not been found (because this filter didn't have the corresponding rule before),
		// insert at the beginning
		if (startIndex === -1) {
			posteriorSegment = this.filter;
		}
		// start pattern was found, but end pattern was not? error!
		else if (endIndex === -1) {
			throw new Error("missing end segment during rule generation");
		}
		// start and end pattern found
		else {
			priorSegment = this.filter.substring(0, startIndex);
			posteriorSegment = this.filter.substring(endIndex);
		}

		this.filter = priorSegment + ruleSegment + posteriorSegment;
		const countNewlines = (text) => text.split('\n').length - 1;
		const start = countNewlines(priorSegment) + 1;
		this.#ruleLineRange = {start, end: start + countNewlines(ruleSegment) - 1};
	}

	async #uploadFilter() {
		return await poeApi.updateItemFilter(this);
	}

	#updateVersionAndDescription() {
		let versionSuffix = 'u';
		if (!this.version.endsWith(versionSuffix)) {
			this.version += versionSuffix;
		}

		let descriptionSuffix = 'Modified by uniquefilter.dev';
		if (!this.description.endsWith(descriptionSuffix)) {
			this.description += '\n' + descriptionSuffix;
		}
	}

	#sanitizeStyleText(styleString) {
		let sanitizedStyleText = styleString; // don't modify input string

		// styleString might contain 'Show' (e.g. as generated by filterblade's 'Filter Line Translator') which is not part of the style.
		if (sanitizedStyleText.startsWith('Show')) {
			sanitizedStyleText = sanitizedStyleText.replace(/^Show\n/, '');
		}
		// also remove all tabs, so we can apply our own formatting
		sanitizedStyleText = sanitizedStyleText.replaceAll('\t', '');
		// now add one tab at the start of each line
		sanitizedStyleText = sanitizedStyleText.replaceAll(/^/gm, '\t');
		return sanitizedStyleText;
	}
}