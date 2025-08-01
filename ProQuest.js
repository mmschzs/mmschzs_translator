{
	"translatorID": "fce388a6-a847-4777-87fb-6595e710b7e7",
	"label": "ProQuest",
	"creator": "Avram Lyon",
	"target": "^https?://(www|search)\\.proquest\\.com/(.*/)?(docview|pagepdf|results|publicationissue|browseterms|browsetitles|browseresults|myresearch/(figtables|documents))",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2025-07-31 17:15:12"
}

/*
	***** BEGIN LICENSE BLOCK *****
   ProQuest Translator
   Copyright (C) 2011-2020 Avram Lyon, ajlyon@gmail.com and Sebastian Karcher

   TThis file is part of Zotero.

 	Zotero is free software: you can redistribute it and/or modify
 	it under the terms of the GNU Affero General Public License as published by
 	the Free Software Foundation, either version 3 of the License, or
 	(at your option) any later version.

 	Zotero is distributed in the hope that it will be useful,
 	but WITHOUT ANY WARRANTY; without even the implied warranty of
 	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 	GNU Affero General Public License for more details.

 	You should have received a copy of the GNU Affero General Public License
 	along with Zotero. If not, see <http://www.gnu.org/licenses/>.

 	***** END LICENSE BLOCK ******/


var language = "English";
var L = {};
var isEbrary = false;

// returns an array of values for a given field or array of fields
// the values are in the same order as the field names
function getTextValue(doc, fields) {
	if (typeof (fields) != 'object') fields = [fields];

	// localize fields
	fields = fields.map(
		function (field) {
			if (fieldNames[language]) {
				return fieldNames[language][field] || field;
			}
			else {
				return field;
			}
		});

	var allValues = [], values;
	for (let i = 0, n = fields.length; i < n; i++) {
		values = ZU.xpath(doc,
			'//div[@class="display_record_indexing_fieldname" and	normalize-space(text())="' + fields[i]
			+ '"]/following-sibling::div[@class="display_record_indexing_data"][1]');

		if (values.length) values = [values[0].textContent];

		allValues = allValues.concat(values);
	}

	return allValues;
}

// initializes field map translations
function initLang(doc) {
	let lang = text(doc, '.gaMRLanguage');
	if (!lang) lang = ZU.xpathText(doc, '//a[span[contains(@class,"uxf-globe")]]');
	lang = lang.replace(/\u200e/g, ''); // Remove stray left-to-right markers
	Z.debug('Full language label: ' + JSON.stringify(lang));
	if (lang && lang != "English") {
		lang = lang.split(',')[0].trim();
		Z.debug('Trimmed language label: ' + JSON.stringify(lang));

		// if already initialized, don't need to do anything else
		if (lang == language) return;

		language = lang;

		// build reverse field map
		L = {};
		for (let i in fieldNames[language]) {
			L[fieldNames[language][i]] = i;
		}

		return;
	}

	language = 'English';
	L = {};
}

function getSearchResults(doc, checkOnly, extras) {
	var root;
	var elements = doc.getElementsByClassName('resultListContainer');
	
	for (let i = 0; i < elements.length; i++) {
		if (elements[i] && elements[i].childElementCount) {
			root = elements[i];
			break;
		}
	}
	
	if (!root) {
		Z.debug("No root found");
		return false;
	}

	var results = root.getElementsByClassName('resultItem');
	// root.querySelectorAll('.resultTitle, .previewTitle');
	var items = {}, found = false;
	isEbrary = (results && results[0] && results[0].getElementsByClassName('ebraryitem').length > 0);
	// if the first result is Ebrary, they all are - we're looking at the Ebrary results tab
	
	for (let i = 0, n = results.length; i < n; i++) {
		var title = results[i].querySelectorAll('h3 a')[0];
		// Z.debug(title)
		if (!title || !title.href) continue;
		
		if (checkOnly) return true;
		found = true;
		
		var item = ZU.trimInternal(title.textContent);
		var preselect = results[i].getElementsByClassName('marked_list_checkbox')[0];
		if (preselect) {
			item = {
				title: item,
				checked: preselect.checked
			};
		}
		
		items[title.href] = item;
		
		if (isEbrary && Zotero.isBookmarklet) {
			extras[title.href] = {
				html: results[i],
				title: item,
				url: title.href
			};
		}
	}

	return found ? items : false;
}

function detectWeb(doc, url) {
	initLang(doc);
	
	// Check for multiple first
	if (!url.includes('docview') && !url.includes('pagepdf')) {
		return getSearchResults(doc, true) ? 'multiple' : false;
	}
	
	// if we are on Abstract/Details page,
	// then we can read the type from the corresponding field
	var types = getTextValue(doc, ["Source type", "Document type", "Record type"]);
	var zoteroType = getItemType(types);
	if (zoteroType) return zoteroType;
	
	// hack for NYTs, which misses crucial data.
	var db = getTextValue(doc, "Database")[0];
	if (db && db.includes("The New York Times")) {
		return "newspaperArticle";
	}

	// there is not much information about the item type in the pdf/fulltext page
	let titleRow = text(doc, '.open-access');
	if (titleRow && doc.getElementById('docview-nav')) { // do not continue if there is no nav to the Abstract, as the translation will fail
		if (getItemType([titleRow])) {
			return getItemType([titleRow]);
		}
		// Fall back on journalArticle - even if we couldn't guess the type
		return "journalArticle";
	}
	return false;
}

function doWeb(doc, url, noFollow) {
	let type = detectWeb(doc, url);
	if (type == "multiple") {
		// detect web returned multiple
		var resultData = {};
		
		Zotero.selectItems(getSearchResults(doc, false, resultData), function (items) {
			if (!items) return;
			
			var articles = [];
			for (let item in items) {
				articles.push(item);
			}
			
			if (isEbrary) {
				if (Zotero.isBookmarklet) {
					// The bookmarklet can't use the ebrary translator
					
					var refs = [];
					
					for (let i in items) {
						refs.push(resultData[i]);
					}
					
					scrapeEbraryResults(refs);
				}
				else {
					ZU.processDocuments(articles, function (doc) {
						var translator = Zotero.loadTranslator("web");
						translator.setTranslator("2abe2519-2f0a-48c0-ad3a-b87b9c059459");
						translator.setDocument(doc);
						translator.translate();
					});
				}
			}
			else {
				ZU.processDocuments(articles, doWeb);
			}
		});
	}
	else {
		// Third option is for EEBO
		const abstractTab = doc.getElementById('addFlashPageParameterformat_abstract') || doc.getElementById('addFlashPageParameterformat_citation') || doc.getElementById("link_prefix_addFlashPageParameterformat_citation");
		// E.g. on ERIC
		const abstractView = doc.getElementsByClassName('abstractContainer');
		if (abstractTab && abstractTab.classList.contains('active')) {
			Zotero.debug("On Abstract tab and scraping");
			scrape(doc, url, type);
		}
		else if (abstractTab && abstractTab.href) {
			var link = abstractTab.href;
			Zotero.debug("Going to the Abstract tab");
			ZU.processDocuments(link, function (doc, url) {
				doWeb(doc, url, true);
			});
		}
		else if (abstractView.length) {
			Zotero.debug("new Abstract view");
			scrape(doc, url, type);
		}
		else if (doc.querySelector('.docViewFullCitation .display_record_indexing_row')) {
			Zotero.debug("Full citation view");
			scrape(doc, url, type);
		}
		else if (noFollow) {
			Z.debug('Not following link again. Attempting to scrape');
			scrape(doc, url, type);
		}
		else {
			throw new Error("Could not find the abstract/metadata link");
		}
	}
}

function scrape(doc, url, type) {
	var item = new Zotero.Item(type);
	
	// get all rows
	var rows = doc.getElementsByClassName('display_record_indexing_row');
	
	var dates = [], place = {}, altKeywords = [];

	for (let i = 0, n = rows.length; i < n; i++) {
		let labelElem = rows[i].childNodes[0];
		let valueElem = rows[i].childNodes[1];
		
		if (!labelElem || !valueElem) continue;

		let label = labelElem.textContent.trim();
		let value = valueElem.textContent.trim();	// trimInternal?

		// translate label
		let enLabel = L[label] || label;
		let creatorType;
		switch (enLabel) {
			case 'Title':
				if (value == value.toUpperCase()) value = ZU.capitalizeTitle(value, true);
				item.title = value;
				break;
			case 'Collection name':
				if (!item.title) {
					item.title = value;
				}
				break;
			case 'Author':
			case 'Editor':	// test case?
			case 'People':
				if (enLabel == 'Author') {
					creatorType = 'author';
				}
				else if (enLabel == 'Editor') {
					creatorType = 'editor';
				}
				else {
					creatorType = 'contributor';
				}
				
				// Use titles of a tags if they exist, since these don't include
				// affiliations; don't include links to ORCID profiles
				value = ZU.xpathText(valueElem, "a[not(@id='orcidLink')]/@title", null, "; ") || value;

				value = value.replace(/^by\s+/i, '')	// sometimes the authors begin with "By"
							.split(/\s*;\s*|\s+and\s+/i);

				for (let j = 0, m = value.length; j < m; j++) {
					// TODO: might have to detect proper creator type from item type*/
					item.creators.push(
						ZU.cleanAuthor(value[j], creatorType, value[j].includes(',')));
				}
				break;
			case 'Signator':
				if (item.itemType == 'letter') {
					for (let signator of valueElem.querySelectorAll('a')) {
						let name = signator.textContent;
						item.creators.push(
							ZU.cleanAuthor(name, 'author', name.includes(',')));
					}
				}
				break;
			case 'Recipient':
				if (item.itemType == 'letter') {
					for (let recipient of valueElem.querySelectorAll('a')) {
						let name = recipient.textContent;
						if (/\b(department|bureau|office|director)\b/i.test(name)) {
							// a general edge case that we handle specifically,
							// but institutional recipients are common and we'd
							// like not to split the name when we can
							item.creators.push({
								lastName: name,
								creatorType: 'recipient',
								fieldMode: 1
							});
						}
						else {
							item.creators.push(
								ZU.cleanAuthor(name, 'recipient', name.includes(',')));
						}
					}
				}
				break;
			case 'Publication title':
				item.publicationTitle = value.replace(/;.+/, "");
				break;
			case 'Volume':
				item.volume = value;
				break;
			case 'Issue':
				item.issue = value;
				break;
			case 'Number of pages':
				item.numPages = value;
				break;
			case 'ISSN':
				item.ISSN = value;
				break;
			case 'ISBN':
				item.ISBN = value;
				break;
			case 'DOI':	// test case?
				item.DOI = ZU.cleanDOI(value);
				break;
			case 'Copyright':
				item.rights = value;
				break;
			case 'Language of publication':
			case 'Language':
				item.language = value;
				break;
			case 'Section':
				item.section = value;
				break;
			case 'Pages':
				item.pages = value;
				break;
			case 'First page':
				item.firstPage = value;
				break;
			case 'University/institution':
			case 'School':
				item.university = value;
				break;
			case 'Degree':
				item.thesisType = value;
				break;
			case 'Publisher':
			case 'Printer/Publisher':
				item.publisher = valueElem.innerText.split('\n')[0];
				break;
			case 'Repository':
				item.archive = value;
				break;
			case 'Accession number/LC reference':
				item.archiveLocation = value;
				break;

			case 'Identifier / keyword':
			case 'NUCMC index term':
			case 'Subject':
				if (valueElem.querySelector('a')) {
					item.tags.push(...Array.from(valueElem.querySelectorAll('a'))
						.map(a => a.textContent.replace(/\.$/, '')));
				}
				else {
					item.tags.push(...value.split(/\s*(?:,|;)\s*/));
				}
				break;
			case 'Journal subject':
			case 'Publication subject':
				// alternative tags
				altKeywords.push(value);
				break;

			case 'Publication note':
				item.notes.push({ note: valueElem.innerText }); // Keep line breaks
				break;

			// we'll figure out proper location later
			case 'University location':
			case 'School location':
				place.schoolLocation = value;
				break;
			case 'Place of publication':
				place.publicationPlace = value;
				break;
			case 'Country of publication':
				place.publicationCountry = value;
				break;
			

			// multiple dates are provided
			// more complete dates are preferred
			case 'Date':
			case 'Publication date':
			case 'Degree date':
				dates[2] = value;
				break;
			case 'Publication year':
				dates[1] = value;
				break;
			case 'Year':
				dates[0] = value;
				break;

			// we already know about these; we can skip them unless we want to
			// disambiguate a general item type
			case 'Source type':
				break;
			case 'Document type':
				if (item.itemType == 'letter') {
					if (value.trim().toLowerCase() != 'letter') {
						item.letterType = value;
					}
				}
				break;
			case 'Record type':
			case 'Database':
				break;

			default:
				Z.debug('Unhandled field: "' + label + '": ' + value);
		}
	}

	if (!item.title) {
		item.title = text(doc, '#documentTitle');
	}

	item.url = url.replace(/&?(accountid|parentSessionId)=[^&#]*/g, '').replace(/\?(?:#|$)/, '').replace('?&', '?');
	if (item.itemType == "thesis" && place.schoolLocation) {
		item.place = place.schoolLocation;
	}
	
	else if (place.publicationPlace) {
		item.place = place.publicationPlace;
		if (place.publicationCountry) {
			item.place = item.place + ', ' + place.publicationCountry.replace(/,.+/, "");
		}
	}

	item.date = dates.pop();

	// Sometimes we can get first page and num pages for a journal article
	if (item.firstPage && !item.pages) {
		var firstPage = parseInt(item.firstPage);
		var numPages = parseInt(item.numPages);
		if (!numPages || numPages < 2) {
			item.pages = item.firstPage;
		}
		else {
			item.pages = firstPage + '–' + (firstPage + numPages - 1);
		}
	}

	// sometimes number of pages ends up in pages
	if (!item.numPages) item.numPages = item.pages;
	
	// don't override the university with a publisher information for a thesis
	if (item.itemType == "thesis" && item.university && item.publisher) {
		delete item.publisher;
	}
	
	// lanuguage is sometimes given as full word and abbreviation
	if (item.language) item.language = item.language.split(/\s*;\s*/)[0];

	// parse some data from the byline in case we're missing publication title
	// or the date is not complete
	var byline = ZU.xpath(doc, '//span[contains(@class, "titleAuthorETC")][last()]');
	// add publication title if we don't already have it
	if (!item.publicationTitle
		&& ZU.fieldIsValidForType('publicationTitle', item.itemType)) {
		var pubTitle = ZU.xpathText(byline, './/a[@id="lateralSearch"]');
		if (!pubTitle) {
			pubTitle = text(doc, '#authordiv .newspaperArticle .pub-tooltip-trigger')
				|| text(doc, '#authordiv .newspaperArticle strong');
		}
		// remove date range
		if (pubTitle) item.publicationTitle = pubTitle.replace(/\s*\(.+/, '');
	}

	var date = ZU.xpathText(byline, './text()');
	if (date) date = date.match(/]\s+(.+?):/);
	// Convert date to ISO to make sure we don't save random strings
	if (date) date = ZU.strToISO(date[1]);
	// add date if we only have a year and date is longer in the byline
	if (date
		&& (!item.date
			|| (item.date.length <= 4 && date.length > item.date.length))) {
		item.date = date;
	}

	// Historical Newspapers: date and page are in title
	if (item.itemType == 'newspaperArticle') {
		let matches = item.title.match(/^(\w+ \d{1,2}, \d{4}) \(Page (\d+)/);
		if (matches) {
			let [, date, pageNumber] = matches;
			item.date = ZU.strToISO(date);
			item.pages = pageNumber;
		}
	}

	item.abstractNote = ZU.xpath(doc, '//div[contains(@id, "abstractSummary_")]//p')
		.map(function (p) {
			return ZU.trimInternal(p.textContent);
		}).join('\n');

	if (!item.tags.length && altKeywords.length) {
		item.tags = altKeywords.join(',').split(/\s*(?:,|;)\s*/);
	}
	
	let pdfLink = doc.querySelector('[id^="downloadPDFLink"]');
	if (pdfLink && !pdfLink.closest('#suggestedSourcesBelowFullText')) {
		item.attachments.push({
			title: 'Full Text PDF',
			url: pdfLink.href,
			mimeType: 'application/pdf',
			proxy: false
		});
	}
	else {
		var fullText = ZU.xpath(doc, '//li[@id="tab-Fulltext-null"]/a')[0];
		if (fullText) {
			item.attachments.push({
				title: 'Full Text Snapshot',
				url: fullText.href,
				mimeType: 'text/html'
			});
		}
	}
	
	item.complete();
}

function getItemType(types) {
	var guessType;
	for (var i = 0, n = types.length; i < n; i++) {
		// put the testString to lowercase and test for singular only for maxmial compatibility
		// in most cases we just can return the type, but sometimes only save it as a guess and will use it only if we don't have anything better
		var testString = types[i].toLowerCase();
		if (testString.includes("journal") || testString.includes("periodical")) {
			// "Scholarly Journals", "Trade Journals", "Historical Periodicals"
			return "journalArticle";
		}
		else if (testString.includes("newspaper") || testString.includes("wire feed")) {
			// "Newspapers", "Wire Feeds", "WIRE FEED", "Historical Newspapers"
			return "newspaperArticle";
		}
		else if (testString.includes("dissertation")) {
			// "Dissertations & Theses", "Dissertation/Thesis", "Dissertation"
			return "thesis";
		}
		else if (testString.includes("chapter")) {
			// "Chapter"
			return "bookSection";
		}
		else if (testString.includes("book")) {
			// "Book, Authored Book", "Book, Edited Book", "Books"
			guessType = "book";
		}
		else if (testString.includes("conference paper")) {
			// "Conference Papers and Proceedings", "Conference Papers & Proceedings"
			return "conferencePaper";
		}
		else if (testString.includes("magazine")) {
			// "Magazines"
			return "magazineArticle";
		}
		else if (testString.includes("report")) {
			// "Reports", "REPORT"
			return "report";
		}
		else if (testString.includes("website")) {
			// "Blogs, Podcats, & Websites"
			guessType = "webpage";
		}
		else if (testString == "blog" || testString == "article in an electronic resource or web site") {
			// "Blog", "Article In An Electronic Resource Or Web Site"
			return "blogPost";
		}
		else if (testString.includes("patent")) {
			// "Patent"
			return "patent";
		}
		else if (testString.includes("pamphlet")) {
			// Pamphlets & Ephemeral Works
			guessType = "manuscript";
		}
		else if (testString.includes("encyclopedia")) {
			// "Encyclopedias & Reference Works"
			guessType = "encyclopediaArticle";
		}
		else if (testString.includes("statute")) {
			return "statute";
		}
		else if (testString.includes("letter") || testString.includes("cable")) {
			guessType = "letter";
		}
		else if (testString.includes("archival material")) {
			guessType = "manuscript";
		}
	}

	// We don't have localized strings for item types, so just guess that it's a journal article
	if (!guessType && language != 'English') {
		return 'journalArticle';
	}

	return guessType;
}

function scrapeEbraryResults(refs) {
	// Since we can't chase URLs, let's get what we can from the page
	
	for (let i = 0; i < refs.length; i++) {
		var ref = refs[i];
		var hiddenData = ZU.xpathText(ref.html, './span');
		var visibleData = Array.prototype.map.call(ref.html.getElementsByClassName('results_list_copy'), function (node) {
			// The text returned by textContent is of the following format:
			// book title \n author, first; [author, second; ...;] publisher name; publisher location (date) \n
			return /\n(.*)\n?/.exec(node.textContent)[1].split(';').reverse();
		})[0];
		var item = new Zotero.Item("book");
		var date = /\(([\w\s]+)\)/.exec(visibleData[0]);
		var place = /([\w,\s]+)\(/.exec(visibleData[0]);
		var isbn = /isbn,\svalue\s=\s'([\dX]+)'/i.exec(hiddenData);
		var language = /language_code,\svalue\s=\s'([A-Za-z]+)'\n/i.exec(hiddenData);
		var numPages = /page_count,\svalue\s=\s'(\d+)'\n/i.exec(hiddenData);
		var locNum = /lccn,\svalue\s=\s'([-.\s\w]+)'\n/i.exec(hiddenData);

		item.title = ref.title;
		item.url = ref.url;
		
		if (date) {
			item.date = date[1];
		}
		
		if (place) {
			item.place = place[1].trim();
		}
		
		item.publisher = visibleData[1].trim();
		
		// Push the authors in reverse to restore the original order
		for (var j = visibleData.length - 1; j >= 2; j--) {
			item.creators.push(ZU.cleanAuthor(visibleData[j], "author", true));
		}
		
		if (isbn) {
			item.ISBN = isbn[1];
		}
		
		if (language) {
			item.language = language[1];
		}
		
		if (numPages) {
			item.numPages = numPages[1];
		}
		
		if (locNum) {
			item.callNumber = locNum[1];
		}
		
		item.complete();
	}
}

// localized field names
var fieldNames = {
	العربية: {
		"Source type": 'نوع المصدر',
		"Document type": 'نوع المستند',
		// "Record type"
		Database: 'قاعدة البيانات',
		Title: 'العنوان',
		Author: 'المؤلف',
		// "Editor":
		"Publication title": 'عنوان المطبوعة',
		Volume: 'المجلد',
		Issue: 'الإصدار',
		"Number of pages": 'عدد الصفحات',
		ISSN: 'رقم المسلسل الدولي',
		ISBN: 'الترقيم الدولي للكتاب',
		// "DOI":
		Copyright: 'حقوق النشر',
		Language: 'اللغة',
		"Language of publication": 'لغة النشر',
		Section: 'القسم',
		"Publication date": 'تاريخ النشر',
		"Publication year": 'عام النشر',
		Year: 'العام',
		Pages: 'الصفحات',
		School: 'المدرسة',
		Degree: 'الدرجة',
		Publisher: 'الناشر',
		"Printer/Publisher": 'جهة الطباعة/الناشر',
		"Place of publication": 'مكان النشر',
		"School location": 'موقع المدرسة',
		"Country of publication": 'بلد النشر',
		"Identifier / keyword": 'معرف / كلمة أساسية',
		Subject: 'الموضوع',
		"Journal subject": 'موضوع الدورية'
	},
	'Bahasa Indonesia': {
		"Source type": 'Jenis sumber',
		"Document type": 'Jenis dokumen',
		// "Record type"
		Database: 'Basis data',
		Title: 'Judul',
		Author: 'Pengarang',
		// "Editor":
		"Publication title": 'Judul publikasi',
		Volume: 'Volume',
		Issue: 'Edisi',
		"Number of pages": 'Jumlah halaman',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: 'Hak cipta',
		Language: 'Bahasa',
		"Language of publication": 'Bahasa publikasi',
		Section: 'Bagian',
		"Publication date": 'Tanggal publikasi',
		"Publication year": 'Tahun publikasi',
		Year: 'Tahun',
		Pages: 'Halaman',
		School: 'Sekolah',
		Degree: 'Gelar',
		Publisher: 'Penerbit',
		"Printer/Publisher": 'Pencetak/Penerbit',
		"Place of publication": 'Tempat publikasi',
		"School location": 'Lokasi sekolah',
		"Country of publication": 'Negara publikasi',
		"Identifier / keyword": 'Pengidentifikasi/kata kunci',
		Subject: 'Subjek',
		"Journal subject": 'Subjek jurnal'
	},
	Čeština: {
		"Source type": 'Typ zdroje',
		"Document type": 'Typ dokumentu',
		// "Record type"
		Database: 'Databáze',
		Title: 'Název',
		Author: 'Autor',
		// "Editor":
		"Publication title": 'Název publikace',
		Volume: 'Svazek',
		Issue: 'Číslo',
		"Number of pages": 'Počet stránek',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: 'Copyright',
		Language: 'Jazyk',
		"Language of publication": 'Jazyk publikace',
		Section: 'Sekce',
		"Publication date": 'Datum vydání',
		"Publication year": 'Rok vydání',
		Year: 'Rok',
		Pages: 'Strany',
		School: 'Instituce',
		Degree: 'Stupeň',
		Publisher: 'Vydavatel',
		"Printer/Publisher": 'Tiskař/vydavatel',
		"Place of publication": 'Místo vydání',
		"School location": 'Místo instituce',
		"Country of publication": 'Země vydání',
		"Identifier / keyword": 'Identifikátor/klíčové slovo',
		Subject: 'Předmět',
		"Journal subject": 'Předmět časopisu'
	},
	Deutsch: {
		"Source type": 'Quellentyp',
		"Document type": 'Dokumententyp',
		// "Record type"
		Database: 'Datenbank',
		Title: 'Titel',
		Author: 'Autor',
		// "Editor":
		"Publication title": 'Titel der Publikation',
		Volume: 'Band',
		Issue: 'Ausgabe',
		"Number of pages": 'Seitenanzahl',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: 'Copyright',
		Language: 'Sprache',
		"Language of publication": 'Publikationssprache',
		Section: 'Bereich',
		"Publication date": 'Publikationsdatum',
		"Publication year": 'Erscheinungsjahr',
		Year: 'Jahr',
		Pages: 'Seiten',
		School: 'Bildungseinrichtung',
		Degree: 'Studienabschluss',
		Publisher: 'Herausgeber',
		"Printer/Publisher": 'Drucker/Verleger',
		"Place of publication": 'Verlagsort',
		"School location": 'Standort der Bildungseinrichtung',
		"Country of publication": 'Publikationsland',
		"Identifier / keyword": 'Identifikator/Schlüsselwort',
		Subject: 'Thema',
		"Journal subject": 'Zeitschriftenthema'
	},
	Español: {
		"Source type": 'Tipo de fuente',
		"Document type": 'Tipo de documento',
		// "Record type"
		Database: 'Base de datos',
		Title: 'Título',
		Author: 'Autor',
		// "Editor":
		"Publication title": 'Título de publicación',
		Volume: 'Tomo',
		Issue: 'Número',
		"Number of pages": 'Número de páginas',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: 'Copyright',
		Language: 'Idioma',
		"Language of publication": 'Idioma de la publicación',
		Section: 'Sección',
		"Publication date": 'Fecha de titulación',
		"Publication year": 'Año de publicación',
		Year: 'Año',
		Pages: 'Páginas',
		School: 'Institución',
		Degree: 'Título universitario',
		Publisher: 'Editorial',
		"Printer/Publisher": 'Imprenta/publicista',
		"Place of publication": 'Lugar de publicación',
		"School location": 'Lugar de la institución',
		"Country of publication": 'País de publicación',
		"Identifier / keyword": 'Identificador / palabra clave',
		Subject: 'Materia',
		"Journal subject": 'Materia de la revista'
	},
	Français: {
		"Source type": 'Type de source',
		"Document type": 'Type de document',
		// "Record type"
		Database: 'Base de données',
		Title: 'Titre',
		Author: 'Auteur',
		// "Editor":
		"Publication title": 'Titre de la publication',
		Volume: 'Volume',
		Issue: 'Numéro',
		"Number of pages": 'Nombre de pages',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: 'Copyright',
		Language: 'Langue',
		"Language of publication": 'Langue de publication',
		Section: 'Section',
		"Publication date": 'Date du diplôme',
		"Publication year": 'Année de publication',
		Year: 'Année',
		Pages: 'Pages',
		"First page": 'Première page',
		School: 'École',
		Degree: 'Diplôme',
		Publisher: 'Éditeur',
		"Printer/Publisher": 'Imprimeur/Éditeur',
		"Place of publication": 'Lieu de publication',
		"School location": "Localisation de l'école",
		"Country of publication": 'Pays de publication',
		"Identifier / keyword": 'Identificateur / mot-clé',
		Subject: 'Sujet',
		"Journal subject": 'Sujet de la publication'
	},
	한국어: {
		"Source type": '원본 유형',
		"Document type": '문서 형식',
		// "Record type"
		Database: '데이터베이스',
		Title: '제목',
		Author: '저자',
		// "Editor":
		"Publication title": '출판물 제목',
		Volume: '권',
		Issue: '호',
		"Number of pages": '페이지 수',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: 'Copyright',
		Language: '언어',
		"Language of publication": '출판 언어',
		Section: '섹션',
		"Publication date": '출판 날짜',
		"Publication year": '출판 연도',
		Year: '연도',
		Pages: '페이지',
		School: '학교',
		Degree: '학위',
		Publisher: '출판사',
		"Printer/Publisher": '인쇄소/출판사',
		"Place of publication": '출판 지역',
		"School location": '학교 지역',
		"Country of publication": '출판 국가',
		"Identifier / keyword": '식별자/키워드',
		Subject: '주제',
		"Journal subject": '저널 주제'
	},
	Italiano: {
		"Source type": 'Tipo di fonte',
		"Document type": 'Tipo di documento',
		// "Record type"
		Database: 'Database',
		Title: 'Titolo',
		Author: 'Autore',
		// "Editor":
		"Publication title": 'Titolo pubblicazione',
		Volume: 'Volume',
		Issue: 'Fascicolo',
		"Number of pages": 'Numero di pagine',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: 'Copyright',
		Language: 'Lingua',
		"Language of publication": 'Lingua di pubblicazione',
		Section: 'Sezione',
		"Publication date": 'Data di pubblicazione',
		"Publication year": 'Anno di pubblicazione',
		Year: 'Anno',
		Pages: 'Pagine',
		School: 'Istituzione accademica',
		Degree: 'Titolo accademico',
		Publisher: 'Casa editrice',
		"Printer/Publisher": 'Tipografo/Editore',
		"Place of publication": 'Luogo di pubblicazione:',
		"School location": 'Località istituzione accademica',
		"Country of publication": 'Paese di pubblicazione',
		"Identifier / keyword": 'Identificativo/parola chiave',
		Subject: 'Soggetto',
		"Journal subject": 'Soggetto rivista'
	},
	Magyar: {
		"Source type": 'Forrástípus',
		"Document type": 'Dokumentum típusa',
		// "Record type"
		Database: 'Adatbázis',
		Title: 'Cím',
		Author: 'Szerző',
		// "Editor":
		"Publication title": 'Publikáció címe',
		Volume: 'Kötet',
		Issue: 'Szám',
		"Number of pages": 'Oldalszám',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: 'Copyright',
		Language: 'Nyelv',
		"Language of publication": 'Publikáció nyelve',
		Section: 'Rész',
		"Publication date": 'Publikáció dátuma',
		"Publication year": 'Publikáció éve',
		Year: 'Év',
		Pages: 'Oldalak',
		School: 'Iskola',
		Degree: 'Diploma',
		Publisher: 'Kiadó',
		"Printer/Publisher": 'Nyomda/kiadó',
		"Place of publication": 'Publikáció helye',
		"School location": 'Iskola helyszíne:',
		"Country of publication": 'Publikáció országa',
		"Identifier / keyword": 'Azonosító / kulcsszó',
		Subject: 'Tárgy',
		"Journal subject": 'Folyóirat tárgya'
	},
	日本語: {
		"Source type": 'リソースタイプ',
		"Document type": 'ドキュメントのタイプ',
		// "Record type"
		Database: 'データベース',
		Title: 'タイトル',
		Author: '著者',
		// "Editor":
		"Publication title": '出版物のタイトル',
		Volume: '巻',
		Issue: '号',
		"Number of pages": 'ページ数',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: '著作権',
		Language: '言語',
		"Language of publication": '出版物の言語',
		Section: 'セクション',
		"Publication date": '出版日',
		"Publication year": '出版年',
		Year: '年',
		Pages: 'ページ',
		School: '学校',
		Degree: '学位称号',
		Publisher: '出版社',
		"Printer/Publisher": '印刷業者/出版社',
		"Place of publication": '出版地',
		"School location": '学校所在地',
		"Country of publication": '出版国',
		"Identifier / keyword": '識別子 / キーワード',
		Subject: '主題',
		"Journal subject": '学術誌の主題'
	},
	Norsk: {
		"Source type": 'Kildetype',
		"Document type": 'Dokumenttypeند',
		// "Record type"
		Database: 'Database',
		Title: 'Tittel',
		Author: 'Forfatter',
		// "Editor":
		"Publication title": 'Utgivelsestittel',
		Volume: 'Volum',
		Issue: 'Utgave',
		"Number of pages": 'Antall sider',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: 'Opphavsrett',
		Language: 'Språk',
		"Language of publication": 'Utgivelsesspråk',
		Section: 'Del',
		"Publication date": 'Utgivelsesdato',
		"Publication year": 'Utgivelsesår',
		Year: 'År',
		Pages: 'Sider',
		School: 'Skole',
		Degree: 'Grad',
		Publisher: 'Utgiver',
		"Printer/Publisher": 'Trykkeri/utgiver',
		"Place of publication": 'Utgivelsessted',
		"School location": 'Skolested',
		"Country of publication": 'Utgivelsesland',
		"Identifier / keyword": 'Identifikator/nøkkelord',
		Subject: 'Emne',
		"Journal subject": 'Journalemne'
	},
	Polski: {
		"Source type": 'Typ źródła',
		"Document type": 'Rodzaj dokumentu',
		// "Record type"
		Database: 'Baza danych',
		Title: 'Tytuł',
		Author: 'Autor',
		// "Editor":
		"Publication title": 'Tytuł publikacji',
		Volume: 'Tom',
		Issue: 'Wydanie',
		"Number of pages": 'Liczba stron',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: 'Prawa autorskie',
		Language: 'Język',
		"Language of publication": 'Język publikacji',
		Section: 'Rozdział',
		"Publication date": 'Data publikacji',
		"Publication year": 'Rok publikacji',
		Year: 'Rok',
		Pages: 'Strony',
		School: 'Uczelnia',
		Degree: 'Stopień',
		Publisher: 'Wydawca',
		"Printer/Publisher": 'Drukarnia/wydawnictwo',
		"Place of publication": 'Miejsce publikacji',
		"School location": 'Lokalizacja uczelni',
		"Country of publication": 'Kraj publikacji',
		"Identifier / keyword": 'Identyfikator/słowo kluczowe',
		Subject: 'Temat',
		"Journal subject": 'Tematyka czasopisma'
	},
	'Português (Brasil)': {
		"Source type": 'Tipo de fonte',
		"Document type": 'Tipo de documento',
		// "Record type"
		Database: 'Base de dados',
		Title: 'Título',
		Author: 'Autor',
		// "Editor":
		"Publication title": 'Título da publicação',
		Volume: 'Volume',
		Issue: 'Edição',
		"Number of pages": 'Número de páginas',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: 'Copyright',
		Language: 'Idioma',
		"Language of publication": 'Idioma de publicação',
		Section: 'Seção',
		"Publication date": 'Data de publicação',
		"Publication year": 'Ano de publicação',
		Year: 'Ano',
		Pages: 'Páginas',
		School: 'Escola',
		Degree: 'Graduação',
		Publisher: 'Editora',
		"Printer/Publisher": 'Editora/selo',
		"Place of publication": 'Local de publicação',
		"School location": 'Localização da escola',
		"Country of publication": 'País de publicação',
		"Identifier / keyword": 'Identificador / palavra-chave',
		Subject: 'Assunto',
		"Journal subject": 'Assunto do periódico'
	},
	'Português (Portugal)': {
		"Source type": 'Tipo de fonte',
		"Document type": 'Tipo de documento',
		// "Record type"
		Database: 'Base de dados',
		Title: 'Título',
		Author: 'Autor',
		// "Editor":
		"Publication title": 'Título da publicação',
		Volume: 'Volume',
		Issue: 'Edição',
		"Number of pages": 'Número de páginas',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: 'Copyright',
		Language: 'Idioma',
		"Language of publication": 'Idioma de publicação',
		Section: 'Secção',
		"Publication date": 'Data da publicação',
		"Publication year": 'Ano da publicação',
		Year: 'Ano',
		Pages: 'Páginas',
		School: 'Escola',
		Degree: 'Licenciatura',
		Publisher: 'Editora',
		"Printer/Publisher": 'Editora/selo',
		"Place of publication": 'Local de publicação',
		"School location": 'Localização da escola',
		"Country of publication": 'País de publicação',
		"Identifier / keyword": 'Identificador / palavra-chave',
		Subject: 'Assunto',
		"Journal subject": 'Assunto da publicação periódica'
	},
	Русский: {
		"Source type": 'Тип источника',
		"Document type": 'Тип документа',
		// "Record type"
		Database: 'База',
		Title: 'Название',
		Author: 'Автор',
		// "Editor":
		"Publication title": 'Название публикации',
		Volume: 'Том',
		Issue: 'Выпуск',
		"Number of pages": 'Число страниц',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: 'Copyright',
		Language: 'Язык',
		"Language of publication": 'Язык публикации',
		Section: 'Раздел',
		"Publication date": 'Дата публикации',
		"Publication year": 'Год публикации',
		Year: 'Год',
		Pages: 'Страницы',
		School: 'Учебное заведение',
		Degree: 'Степень',
		Publisher: 'Издательство',
		"Printer/Publisher": 'Типография/издатель',
		"Place of publication": 'Место публикации',
		"School location": 'Местонахождение учебного заведения',
		"Country of publication": 'Страна публикации',
		"Identifier / keyword": 'Идентификатор / ключевое слово',
		Subject: 'Тема',
		"Journal subject": 'Тематика журнала'
	},
	ไทย: {
		"Source type": 'ประเภทของแหล่งข้อมูล',
		"Document type": 'ประเภทเอกสาร',
		// "Record type"
		Database: 'ฐานข้อมูล',
		Title: 'ชื่อเรื่อง',
		Author: 'ผู้แต่ง',
		// "Editor":
		"Publication title": 'ชื่อเอกสารสิ่งพิมพ์',
		Volume: 'เล่ม',
		Issue: 'ฉบับที่',
		"Number of pages": 'จำนวนหน้า',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: 'ลิขสิทธิ์',
		Language: 'ภาษา',
		"Language of publication": 'ภาษาของเอกสารสิ่งพิมพ์',
		Section: 'ส่วน',
		"Publication date": 'วันที่เอกสารสิ่งพิมพ์',
		"Publication year": 'ปีที่พิมพ์',
		Year: 'ปี',
		Pages: 'หน้า',
		School: 'สถาบันการศึกษา',
		Degree: 'ปริญญาบัตร',
		Publisher: 'สำนักพิมพ์',
		"Printer/Publisher": 'ผู้ตีพิมพ์/ผู้เผยแพร่',
		"Place of publication": 'สถานที่พิมพ์',
		"School location": 'สถานที่ตั้งของสถาบันการศึกษา',
		"Country of publication": 'ประเทศที่พิมพ์',
		"Identifier / keyword": 'ตัวบ่งชี้/คำสำคัญ',
		Subject: 'หัวเรื่อง',
		"Journal subject": 'หัวเรื่องของวารสาร'
	},
	Türkçe: {
		"Source type": 'Yayın türü',
		"Document type": 'Belge türü',
		// "Record type"
		Database: 'Veritabanı',
		Title: 'Başlık',
		Author: 'Yazar adı',
		// "Editor":
		"Publication title": 'Yayın adı',
		Volume: 'Cilt',
		Issue: 'Sayı',
		"Number of pages": 'Sayfa sayısı',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: 'Telif Hakkı',
		Language: 'Dil',
		"Language of publication": 'Yayın Dili',
		Section: 'Bölüm',
		"Publication date": 'Yayınlanma tarihi',
		"Publication year": 'Yayın Yılı',
		Year: 'Yıl',
		Pages: 'Sayfalar',
		School: 'Okul',
		Degree: 'Derece',
		Publisher: 'Yayıncı',
		"Printer/Publisher": 'Basımevi/Yayınc',
		"Place of publication": 'Basım yeri',
		"School location": 'Okul konumu',
		"Country of publication": 'Yayınlanma ülkesi',
		"Identifier / keyword": 'Tanımlayıcı / anahtar kelime',
		Subject: 'Konu',
		"Journal subject": 'Dergi konusu'
	},
	'中文(简体)': {
		"Source type": '来源类型',
		"Document type": '文档类型',
		// "Record type"
		Database: '数据库',
		Title: '标题',
		Author: '作者',
		// "Editor":
		"Publication title": '出版物名称',
		Volume: '卷',
		Issue: '期',
		"Number of pages": '页数',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: '版权',
		Language: '语言',
		"Language of publication": '出版物语言',
		Section: '章节',
		"Publication date": '出版日期',
		"Publication year": '出版年份',
		Year: '出版年',
		Pages: '页',
		School: '学校',
		Degree: '学位',
		Publisher: '出版商',
		"Printer/Publisher": '印刷商/出版商',
		"Place of publication": '出版物地点',
		"School location": '学校地点',
		"Country of publication": '出版物国家/地区',
		"Identifier / keyword": '标识符/关键字',
		Subject: '主题',
		"Journal subject": '期刊主题'
	},
	'中文(繁體)': {
		"Source type": '來源類型',
		"Document type": '文件類型',
		// "Record type"
		Database: '資料庫',
		Title: '標題',
		Author: '作者',
		// "Editor":
		"Publication title": '出版物名稱',
		Volume: '卷期',
		Issue: '期',
		"Number of pages": '頁數',
		ISSN: 'ISSN',
		ISBN: 'ISBN',
		// "DOI":
		Copyright: '著作權',
		Language: '語言',
		"Language of publication": '出版物語言',
		Section: '區段',
		"Publication date": '出版日期',
		"Publication year": '出版年份',
		Year: '年',
		Pages: '頁面',
		School: '學校',
		Degree: '學位',
		Publisher: '出版者',
		"Printer/Publisher": '印刷者/出版者',
		"Place of publication": '出版地',
		"School location": '學校地點',
		"Country of publication": '出版國家/地區',
		"Identifier / keyword": '識別碼/關鍵字',
		Subject: '主題',
		"Journal subject": '期刊主題'
	}
};

/** BEGIN TEST CASES **/
var testCases = [
	{
		"type": "web",
		"url": "https://www.proquest.com/dissertations/docview/251755786/abstract/132B8A749B71E82DBA1/1?sourcetype=Dissertations%20&%20Theses",
		"items": [
			{
				"itemType": "thesis",
				"title": "Beyond Stanislavsky: The influence of Russian modernism on the American theatre",
				"creators": [
					{
						"firstName": "Valleri Jane",
						"lastName": "Robinson",
						"creatorType": "author"
					}
				],
				"date": "2001",
				"abstractNote": "Russian modernist theatre greatly influenced the development of American theatre during the first three decades of the twentieth century. Several developments encouraged the relationships between Russian artists and their American counterparts, including key tours by Russian artists in America, the advent of modernism in the American theatre, the immigration of Eastern Europeans to the United States, American advertising and consumer culture, and the Bolshevik Revolution and all of its domestic and international ramifications. Within each of these major and overlapping developments, Russian culture became increasingly acknowledged and revered by American artists and thinkers, who were seeking new art forms to express new ideas. This study examines some of the most significant contributions of Russian theatre and its artists in the early decades of the twentieth century. Looking beyond the important visit of the Moscow Art Theatre in 1923, this study charts the contributions of various Russian artists and their American supporters.\nCertainly, the influence of Stanislavsky and the Moscow Art Theatre on the modern American theatre has been significant, but theatre historians' attention to his influence has overshadowed the contributions of other Russian artists, especially those who provided non-realistic approaches to theatre. In order to understand the extent to which Russian theatre influenced the American stage, this study focuses on the critics, intellectuals, producers, and touring artists who encouraged interaction between Russians and Americans, and in the process provided the catalyst for American theatrical experimentation. The key figures in this study include some leaders in the Yiddish intellectual and theatrical communities in New York City, Morris Gest and Otto H. Kahn, who imported many important Russian performers for American audiences, and a number of Russian émigré artists, including Jacob Gordin, Jacob Ben-Ami, Benno Schneider, Boris Aronson, and Michel Fokine, who worked in the American theatre during the first three decades of the twentieth century.",
				"language": "English",
				"libraryCatalog": "ProQuest",
				"numPages": "233",
				"place": "United States -- Ohio",
				"rights": "Database copyright ProQuest LLC; ProQuest does not claim copyright in the individual underlying works.",
				"shortTitle": "Beyond Stanislavsky",
				"thesisType": "Ph.D.",
				"university": "The Ohio State University",
				"url": "https://www.proquest.com/dissertations/docview/251755786/abstract/132B8A749B71E82DBA1/1?sourcetype=Dissertations%20&%20Theses",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf",
						"proxy": false
					}
				],
				"tags": [
					{
						"tag": "Communication and the arts"
					},
					{
						"tag": "Konstantin Stanislavsky"
					},
					{
						"tag": "Modernism"
					},
					{
						"tag": "Russian"
					},
					{
						"tag": "Stanislavsky, Konstantin"
					},
					{
						"tag": "Theater"
					},
					{
						"tag": "Theater"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.proquest.com/docview/213445241",
		"items": [
			{
				"itemType": "journalArticle",
				"title": "Peacemaking: moral & policy challenges for a new world // Review",
				"creators": [
					{
						"firstName": "Gerald F.",
						"lastName": "Powers",
						"creatorType": "author"
					},
					{
						"firstName": "Drew",
						"lastName": "Christiansen",
						"creatorType": "author"
					},
					{
						"firstName": "Robert T.",
						"lastName": "Hennemeyer",
						"creatorType": "author"
					}
				],
				"date": "May 1995",
				"ISSN": "00084697",
				"abstractNote": "In his \"Introduction\" to the book entitled Peacemaking: Moral and Policy Challenges for a New World, Rev. Drew Christiansen points out that the Roman Catholic bishops of the United States have made a clear distinction between the social teachings of the Church--comprising universally binding moral and ethical principles--and the particular positions they have taken on public policy issues--such as those relating to war, peace, justice, human rights and other socio-political matters. While the former are not to be mitigated under any circumstances, the latter, being particular applications, observations and recommendations, can allow for plurality of opinion and diversity of focus in the case of specific social, political and opinion and diversity of focus in the case of specific social, political and moral issues.(f.1) Peacemaking aligns itself with this second category. The objectives of this review essay are the following: to summarize the main topics and themes, of some of the recently-published documents on Catholic political thought, relating to peacemaking and peacekeeping; and to provide a brief critique of their main contents, recommendations and suggestions.\nThe Directions of Peacemaking: As in the earlier documents, so too are the virtues of faith, hope, courage, compassion, humility, kindness, patience, perseverance, civility and charity emphasized, in The Harvest of Justice, as definite aids in peacemaking and peacekeeping. The visions of global common good, social and economic development consistent with securing and nurturing conditions for justice and peace, solidarity among people, as well as cooperation among the industrial rich and the poor developing nations are also emphasized as positive enforcements in the peacemaking and peacekeeping processes. All of these are laudable commitments, so long as they are pursued through completely pacifist perspectives. The Harvest of Justice also emphasizes that, \"as far as possible, justice should be sought through nonviolent means;\" however, \"when sustained attempt at nonviolent action fails, then legitimate political authorities are permitted as a last resort to employ limited force to rescue the innocent and establish justice.\"(f.13) The document also frankly admits that \"the vision of Christian nonviolence is not passive.\"(f.14) Such a position may disturb many pacifists. Even though some restrictive conditions--such as a \"just cause,\" \"comparative justice,\" legitimate authority\" to pursue justice issues, \"right intentions,\" probability of success, proportionality of gains and losses in pursuing justice, and the use of force as last resort--are indicated and specified in the document, the use of violence and devastation are sanctioned, nevertheless, by its reaffirmation of the use of force in setting issues and by its support of the validity of the \"just war\" tradition.\nThe first section, entitled \"Theology, Morality, and Foreign Policy in A New World,\" contains four essays. These deal with the new challenges of peace, the illusion of control, creating peace conditions through a theological framework, as well as moral reasoning and foreign policy after the containment. The second, comprising six essays, is entitled \"Human Rights, Self-Determination, and Sustainable Development.\" These essays deal with effective human rights agenda, religious nationalism and human rights, identity, sovereignty, and self-determination, peace and the moral imperatives of democracy, and political economy of peace. The two essays which comprise the third section, entitled \"Global Institutions,\" relate the strengthening of the global institutions and action for the future. The fourth, entitled \"The Use of Force After the Cold War,\" is both interesting and controversial. Its six essays discuss ethical dilemmas in the use of force, development of the just-war tradition, in a multicultural world, casuistry, pacifism, and the just-war tradition, possibilities and limits of humanitarian intervention, and the challenge of peace and stability in a new international order. The last section, devoted to \"Education and Action for Peace,\" contains three essays, which examine the education for peacemaking, the challenge of conscience and the pastoral response to ongoing challenge of peace.",
				"issue": "2",
				"language": "English",
				"libraryCatalog": "ProQuest",
				"pages": "90-100",
				"publicationTitle": "Peace Research",
				"rights": "Copyright Peace Research May 1995",
				"shortTitle": "Peacemaking",
				"url": "https://search.proquest.com/docview/213445241/abstract/6A8F72AFAA5E4C45PQ/1",
				"volume": "27",
				"attachments": [
					{
						"title": "Full Text Snapshot",
						"mimeType": "text/html"
					}
				],
				"tags": [
					{
						"tag": "Book reviews"
					},
					{
						"tag": "Peace"
					},
					{
						"tag": "Political Science--International Relations"
					},
					{
						"tag": "Sciences: Comprehensive Works"
					},
					{
						"tag": "Sociology"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.proquest.com/hnpnewyorktimes/docview/122485317/abstract/1357D8A4FC136DF28E3/11?sourcetype=Newspapers",
		"items": [
			{
				"itemType": "newspaperArticle",
				"title": "Rethinking Policy on East Germany",
				"creators": [
					{
						"firstName": "F. Stephen",
						"lastName": "Larrabee",
						"creatorType": "author"
					},
					{
						"firstName": "R. G.",
						"lastName": "Livingston",
						"creatorType": "author"
					}
				],
				"date": "Aug 22, 1984",
				"ISSN": "03624331",
				"abstractNote": "For some months now, a gradual thaw has been in the making between East Germany and West Germany. So far, the United States has paid scant attention -- an attitude very much in keeping with our neglect of East Germany throughout the postwar period. We should reconsider this policy before things much further -- and should in particular begin to look more closely at what is going on in East Germany.",
				"libraryCatalog": "ProQuest",
				"pages": "A23",
				"place": "New York, N.Y., United States",
				"publicationTitle": "New York Times",
				"rights": "Copyright New York Times Company Aug 22, 1984",
				"url": "https://www.proquest.com/hnpnewyorktimes/docview/122485317/abstract/1357D8A4FC136DF28E3/11?sourcetype=Newspapers",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf",
						"proxy": false
					}
				],
				"tags": [
					{
						"tag": "General Interest Periodicals--United States"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.proquest.com/docview/129023293/abstract?sourcetype=Historical%20Newspapers",
		"items": [
			{
				"itemType": "newspaperArticle",
				"title": "THE PRESIDENT AND ALDRICH.: Railway Age Relates Happenings Behind the Scenes Regarding Rate Regulation.",
				"creators": [],
				"date": "Dec 5, 1905",
				"abstractNote": "The Railway Age says: \"The history of the affair (railroad rate question) as it has gone on behind the scenes, is about as follows.",
				"language": "English",
				"libraryCatalog": "ProQuest",
				"pages": "7",
				"place": "New York, N.Y., United States",
				"publicationTitle": "Wall Street Journal (1889-1922)",
				"rights": "Copyright Dow Jones & Company Inc Dec 5, 1905",
				"shortTitle": "THE PRESIDENT AND ALDRICH.",
				"url": "https://www.proquest.com/docview/129023293/abstract?sourcetype=Historical%20Newspapers",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf",
						"proxy": false
					}
				],
				"tags": [
					{
						"tag": "Business And Economics--Banking And Finance"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.proquest.com/dissertations/pagepdf/251755786/fulltextPDF",
		"items": [
			{
				"itemType": "thesis",
				"title": "Beyond Stanislavsky: The influence of Russian modernism on the American theatre",
				"creators": [
					{
						"firstName": "Valleri Jane",
						"lastName": "Robinson",
						"creatorType": "author"
					}
				],
				"date": "2001",
				"abstractNote": "Russian modernist theatre greatly influenced the development of American theatre during the first three decades of the twentieth century. Several developments encouraged the relationships between Russian artists and their American counterparts, including key tours by Russian artists in America, the advent of modernism in the American theatre, the immigration of Eastern Europeans to the United States, American advertising and consumer culture, and the Bolshevik Revolution and all of its domestic and international ramifications. Within each of these major and overlapping developments, Russian culture became increasingly acknowledged and revered by American artists and thinkers, who were seeking new art forms to express new ideas. This study examines some of the most significant contributions of Russian theatre and its artists in the early decades of the twentieth century. Looking beyond the important visit of the Moscow Art Theatre in 1923, this study charts the contributions of various Russian artists and their American supporters.\nCertainly, the influence of Stanislavsky and the Moscow Art Theatre on the modern American theatre has been significant, but theatre historians' attention to his influence has overshadowed the contributions of other Russian artists, especially those who provided non-realistic approaches to theatre. In order to understand the extent to which Russian theatre influenced the American stage, this study focuses on the critics, intellectuals, producers, and touring artists who encouraged interaction between Russians and Americans, and in the process provided the catalyst for American theatrical experimentation. The key figures in this study include some leaders in the Yiddish intellectual and theatrical communities in New York City, Morris Gest and Otto H. Kahn, who imported many important Russian performers for American audiences, and a number of Russian émigré artists, including Jacob Gordin, Jacob Ben-Ami, Benno Schneider, Boris Aronson, and Michel Fokine, who worked in the American theatre during the first three decades of the twentieth century.",
				"language": "English",
				"libraryCatalog": "ProQuest",
				"numPages": "233",
				"place": "United States -- Ohio",
				"rights": "Database copyright ProQuest LLC; ProQuest does not claim copyright in the individual underlying works.",
				"shortTitle": "Beyond Stanislavsky",
				"thesisType": "Ph.D.",
				"university": "The Ohio State University",
				"url": "https://search.proquest.com/dissertations/docview/251755786/abstract/90033A720D9A4A68PQ/1",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf",
						"proxy": false
					}
				],
				"tags": [
					{
						"tag": "Communication and the arts"
					},
					{
						"tag": "Konstantin"
					},
					{
						"tag": "Konstantin Stanislavsky"
					},
					{
						"tag": "Modernism"
					},
					{
						"tag": "Russian"
					},
					{
						"tag": "Stanislavsky"
					},
					{
						"tag": "Theater"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.proquest.com/dissertations/docview/251755786/previewPDF",
		"items": [
			{
				"itemType": "thesis",
				"title": "Beyond Stanislavsky: The influence of Russian modernism on the American theatre",
				"creators": [
					{
						"firstName": "Valleri Jane",
						"lastName": "Robinson",
						"creatorType": "author"
					}
				],
				"date": "2001",
				"abstractNote": "Russian modernist theatre greatly influenced the development of American theatre during the first three decades of the twentieth century. Several developments encouraged the relationships between Russian artists and their American counterparts, including key tours by Russian artists in America, the advent of modernism in the American theatre, the immigration of Eastern Europeans to the United States, American advertising and consumer culture, and the Bolshevik Revolution and all of its domestic and international ramifications. Within each of these major and overlapping developments, Russian culture became increasingly acknowledged and revered by American artists and thinkers, who were seeking new art forms to express new ideas. This study examines some of the most significant contributions of Russian theatre and its artists in the early decades of the twentieth century. Looking beyond the important visit of the Moscow Art Theatre in 1923, this study charts the contributions of various Russian artists and their American supporters.\nCertainly, the influence of Stanislavsky and the Moscow Art Theatre on the modern American theatre has been significant, but theatre historians' attention to his influence has overshadowed the contributions of other Russian artists, especially those who provided non-realistic approaches to theatre. In order to understand the extent to which Russian theatre influenced the American stage, this study focuses on the critics, intellectuals, producers, and touring artists who encouraged interaction between Russians and Americans, and in the process provided the catalyst for American theatrical experimentation. The key figures in this study include some leaders in the Yiddish intellectual and theatrical communities in New York City, Morris Gest and Otto H. Kahn, who imported many important Russian performers for American audiences, and a number of Russian émigré artists, including Jacob Gordin, Jacob Ben-Ami, Benno Schneider, Boris Aronson, and Michel Fokine, who worked in the American theatre during the first three decades of the twentieth century.",
				"language": "English",
				"libraryCatalog": "ProQuest",
				"numPages": "233",
				"place": "United States -- Ohio",
				"rights": "Database copyright ProQuest LLC; ProQuest does not claim copyright in the individual underlying works.",
				"shortTitle": "Beyond Stanislavsky",
				"thesisType": "Ph.D.",
				"university": "The Ohio State University",
				"url": "https://search.proquest.com/dissertations/docview/251755786/abstract/F77D491D84F4909PQ/1",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf",
						"proxy": false
					}
				],
				"tags": [
					{
						"tag": "Communication and the arts"
					},
					{
						"tag": "Konstantin"
					},
					{
						"tag": "Konstantin Stanislavsky"
					},
					{
						"tag": "Modernism"
					},
					{
						"tag": "Russian"
					},
					{
						"tag": "Stanislavsky"
					},
					{
						"tag": "Theater"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.proquest.com/docview/925553601/137CCF69B9E7916BDCF/1",
		"items": [
			{
				"itemType": "journalArticle",
				"title": "Microsatellite variation and significant population genetic structure of endangered finless porpoises (Neophocaena phocaenoides) in Chinese coastal waters and the Yangtze River",
				"creators": [
					{
						"firstName": "Lian",
						"lastName": "Chen",
						"creatorType": "author"
					},
					{
						"firstName": "Shixia",
						"lastName": "Xu",
						"creatorType": "author"
					},
					{
						"firstName": "Kaiya",
						"lastName": "Zhou",
						"creatorType": "author"
					},
					{
						"firstName": "Guang",
						"lastName": "Yang",
						"creatorType": "author"
					},
					{
						"firstName": "Michael W.",
						"lastName": "Bruford",
						"creatorType": "author"
					}
				],
				"date": "2020",
				"DOI": "http://dx.doi.org/10.1007/s00227-010-1420-x",
				"ISSN": "0025-3162",
				"abstractNote": "The finless porpoise (Neophocaena phocaenoides) inhabits a wide range of tropical and temperate waters of the Indo-Pacific region. Genetic structure of finless porpoises in Chinese waters in three regions (Yangtze River, Yellow Sea, and South China Sea) was analyzed, including the Yangtze finless porpoise which is widely known because of its highly endangered status and unusual adaptation to freshwater. To assist in conservation and management of this species, ten microsatellite loci were used to genotype 125 individuals from the three regions. Contrary to the low genetic diversity revealed in previous mtDNA control region sequence analyses, relatively high levels of genetic variation in microsatellite profiles (HE= 0.732-0.795) were found. Bayesian clustering analysis suggested that finless porpoises in Chinese waters could be described as three distinct genetic groups, which corresponded well to population \"units\" (populations, subspecies, or species) delimited in earlier studies, based on morphological variation, distribution, and genetic analyses. Genetic differentiation between regions was significant, with FST values ranging from 0.07 to 0.137. Immigration rates estimated using a Bayesian method and population ancestry analyses suggested no or very limited gene flow among regional types, even in the area of overlap between types. These results strongly support the classification of porpoises in these regions into distinct evolutionarily significant units, including at least two separate species, and therefore they should be treated as different management units in the design and implementation of conservation programmes. © 2010 Springer-Verlag.",
				"issue": "7",
				"language": "English",
				"libraryCatalog": "ProQuest",
				"pages": "1453-1462",
				"publicationTitle": "Marine Biology",
				"url": "https://search.proquest.com/docview/925553601/137CCF69B9E7916BDCF/1",
				"volume": "157",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf",
						"proxy": false
					}
				],
				"tags": [
					{
						"tag": "84.5.22"
					},
					{
						"tag": "84.5.34"
					},
					{
						"tag": "92.7.2"
					},
					{
						"tag": "CABSCLASS"
					},
					{
						"tag": "CABSCLASS"
					},
					{
						"tag": "CABSCLASS"
					},
					{
						"tag": "DEVELOPMENT"
					},
					{
						"tag": "EUKARYOTIC GENETICS"
					},
					{
						"tag": "EUKARYOTIC GENETICS"
					},
					{
						"tag": "Ecological and Population Genetics"
					},
					{
						"tag": "GENETICS AND MOLECULAR BIOLOGY"
					},
					{
						"tag": "GENETICS AND MOLECULAR BIOLOGY"
					},
					{
						"tag": "Growth Regulators"
					},
					{
						"tag": "Mammalian Genetics"
					},
					{
						"tag": "PLANT SCIENCE"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.proquest.com/docview/1297954386/citation?sourcetype=Scholarly%20Journals",
		"items": [
			{
				"itemType": "journalArticle",
				"title": "Women's Rights as Human Rights: Toward a Re-Vision of Human Rights",
				"creators": [
					{
						"firstName": "Charlotte",
						"lastName": "Bunch",
						"creatorType": "author"
					}
				],
				"date": "Nov 1, 1990",
				"ISSN": "0275-0392",
				"issue": "4",
				"libraryCatalog": "ProQuest",
				"pages": "486–498",
				"publicationTitle": "Human Rights Quarterly",
				"shortTitle": "Women's Rights as Human Rights",
				"url": "https://www.proquest.com/docview/1297954386/citation?sourcetype=Scholarly%20Journals",
				"volume": "12",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf",
						"proxy": false
					}
				],
				"tags": [
					{
						"tag": "Law"
					},
					{
						"tag": "Law--Civil Law"
					},
					{
						"tag": "Political Science"
					},
					{
						"tag": "Political Science--Civil Rights"
					},
					{
						"tag": "Social Sciences (General)"
					},
					{
						"tag": "Social Sciences: Comprehensive Works"
					},
					{
						"tag": "Sociology"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.proquest.com/dnsa/docview/1679056926/fulltextPDF/8C1FDDD8E506429BPQ/1",
		"detectedItemType": "journalArticle",
		"items": [
			{
				"itemType": "letter",
				"title": "Kidnapping of Ambassador Dubs: Sitrep No. 3",
				"creators": [
					{
						"lastName": "United States. Department of State",
						"creatorType": "recipient",
						"fieldMode": 1
					},
					{
						"firstName": "J. Bruce",
						"lastName": "Amstutz",
						"creatorType": "author"
					}
				],
				"date": "February 14, 1979",
				"language": "English",
				"letterType": "Cable",
				"libraryCatalog": "ProQuest",
				"shortTitle": "Kidnapping of Ambassador Dubs",
				"url": "https://www.proquest.com/dnsa/docview/1679056926/abstract/F71353DE52F74E3BPQ/1",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf",
						"proxy": false
					}
				],
				"tags": [
					{
						"tag": "Adolph Kidnapping (14 February 1979)"
					},
					{
						"tag": "Afghanistan. National Police"
					},
					{
						"tag": "Dubs"
					},
					{
						"tag": "Police officers"
					},
					{
						"tag": "Soviet advisors"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.proquest.com/dnsa/docview/1679145498/abstract/BA3C959768F54C93PQ/16?sourcetype=Government%20&%20Official%20Publications",
		"items": [
			{
				"itemType": "letter",
				"title": "[Dear Colleague Letter regarding Prosecution of Yasir Arafat; Includes Letter to Edwin Meese, List of Senators Signing Letter, and Washington Times Article Dated February 7, 1986]",
				"creators": [
					{
						"firstName": "Yasir",
						"lastName": "Arafat",
						"creatorType": "contributor"
					},
					{
						"firstName": "Edwin III",
						"lastName": "Meese",
						"creatorType": "contributor"
					},
					{
						"firstName": "George Curtis",
						"lastName": "Moore",
						"creatorType": "contributor"
					},
					{
						"firstName": "Cleo A.",
						"lastName": "Noel",
						"creatorType": "contributor"
					},
					{
						"firstName": "Ronald W.",
						"lastName": "Reagan",
						"creatorType": "contributor"
					},
					{
						"firstName": "United States Congress",
						"lastName": "Senate",
						"creatorType": "author"
					}
				],
				"date": "January 24, 1986",
				"language": "English",
				"libraryCatalog": "ProQuest",
				"url": "https://www.proquest.com/dnsa/docview/1679145498/abstract/BA3C959768F54C93PQ/16?sourcetype=Government%20&%20Official%20Publications",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf",
						"proxy": false
					}
				],
				"tags": [
					{
						"tag": "Biden, Joseph R., Jr. [et al.]"
					},
					{
						"tag": "Indictments"
					},
					{
						"tag": "Khartoum Embassy Takeover and Assassinations (1973)"
					},
					{
						"tag": "Washington Post"
					},
					{
						"tag": "Washington Times"
					}
				],
				"notes": [
					{
						"note": "Article copyrighted by the Washington Times; used by permission (previously published document)"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.proquest.com/docview/2240944639/citation/DC389F101A924D14PQ/1?sourcetype=Books",
		"items": [
			{
				"itemType": "book",
				"title": "Stereometrie: or the art of practical gauging shewing in two parts, first, divers facil and compendious ways for gauging of tunns and brewers vessels, of all forms and figures, either in whole, or gradualy, form inch to inch: whether the tunn, or vessels bases above and below be homogeneal, or heterogeneal. Parallel and alike-situate, or not. Secondly, the gauging of any wine, brandy, or oyl cask; be the same assum'd as sphæroidal, parabolical, conical, or cylindrical; either full, or partly empty, and at any position of the cask, or altitude of contained liquor: performed either by brief calculation, or instrumental operation. Together with a large table of area's of a circles segments, and other necessary tables, & their excellent utilities and emprovements; with a copious and methodical index of the whole; rendring the work perspicuous and intelligible to mean capacities. / By John Smith, philo-accomptant.",
				"creators": [
					{
						"firstName": "John",
						"lastName": "Smith",
						"creatorType": "author"
					}
				],
				"date": "1673",
				"language": "English",
				"libraryCatalog": "ProQuest",
				"numPages": "[30], 304 p., [3] leaves of plates :",
				"publisher": "Londonprinted by William Godbid, for William Shrowsbury, at the Bible in Duck-Lane",
				"shortTitle": "Stereometrie",
				"url": "https://www.proquest.com/docview/2240944639/citation/DC389F101A924D14PQ/1?sourcetype=Books",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf",
						"proxy": false
					}
				],
				"tags": [
					{
						"tag": "Agriculture, viticulture, texts on hunting, veterinary science"
					},
					{
						"tag": "Gaging - Early works to 1800"
					},
					{
						"tag": "Liquors - Gaging and testing - Early works to 1800"
					},
					{
						"tag": "Science and mathematics"
					},
					{
						"tag": "Wine and wine making - Gaging and testing - Early works to 1800"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.proquest.com/docview/2661071397?sourcetype=Books",
		"items": [
			{
				"itemType": "book",
				"title": "A Pragmatic Future for NAEP: Containing Costs and Updating Technologies. Consensus Study Report",
				"creators": [],
				"date": "2022",
				"ISBN": "9780309275323",
				"abstractNote": "The National Assessment of Educational Progress (NAEP) -- often called \"The Nation's Report Card\" -- is the largest nationally representative and continuing assessment of what students in public and private schools in the United States know and can do in various subjects and has provided policy makers and the public with invaluable information on U.S. students for more than 50 years. Unique in the information it provides, NAEP is the nation's only mechanism for tracking student achievement over time and comparing trends across states and districts for all students and important student groups (e.g., by race, sex, English learner status, disability status, family poverty status). While the program helps educators, policymakers, and the public understand these educational outcomes, the program has incurred substantially increased costs in recent years and now costs about $175.2 million per year. \"A Pragmatic Future for NAEP: Containing Costs and Updating Technologies\" recommends changes to bolster the future success of the program by identifying areas where federal administrators could take advantage of savings, such as new technological tools and platforms as well as efforts to use local administration and deployment for the tests. Additionally, the report recommends areas where the program should clearly communicate about spending and undertake efforts to streamline management. The report also provides recommendations to increase the visibility and coherence of NAEP's research activities. [Contributors include the Division of Behavioral and Social Sciences and Education; Committee on National Statistics; and Panel on Opportunities for the National Assessment of Educational Progress in an Age of AI and Pervasive Computation: A Pragmatic Vision.]",
				"language": "English",
				"libraryCatalog": "ProQuest",
				"publisher": "National Academies Press",
				"shortTitle": "A Pragmatic Future for NAEP",
				"url": "https://www.proquest.com/docview/2661071397?sourcetype=Books",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.proquest.com/archivefinder/docview/2747312572/EC990146E3B1499EPQ/1?sourcetype=Archival%20Materials",
		"items": [
			{
				"itemType": "manuscript",
				"title": "Stamp Act collection",
				"creators": [],
				"date": "1765-1768",
				"abstractNote": "Two reprints (ca. 1843) of the British Stamp Act of 1765; two photocopies of stamps; transcript of a Northampton County, Va., court declaration (1766 Feb. 11) that the act was not binding; contemporary copies of three letters (1766 Feb. 28, Mar. 18, and June 13) relating to the act from English merchants to the colonies, the second letter addressed to John Hancock; and copybook containing transcriptions of letters (1765-1766) from the Court of St. James documenting the reaction of King George III and his government to the protests of American colonists to the Stamp Act. In part, photocopy (positive) and transcripts (handwritten and typewritten); [S.l.]. Typewritten Copy of Northampton County court document made with permission of Clifford I. Millard,; Washington, D.C. : Library of Congress, Manuscript Division, 1932. Forms part of: Miscellaneous Manuscripts collection.",
				"language": "English",
				"libraryCatalog": "ProQuest",
				"url": "https://www.proquest.com/archivefinder/docview/2747312572/EC990146E3B1499EPQ/1?sourcetype=Archival%20Materials",
				"attachments": [],
				"tags": [
					{
						"tag": "Courts; Virginia; Northampton County"
					},
					{
						"tag": "George; III,; King of Great Britain, 1738-1820"
					},
					{
						"tag": "Great Britain; Colonies; America"
					},
					{
						"tag": "Great Britain; Court and courtiers; History; 18th century"
					},
					{
						"tag": "Great Britain; Politics and government; 1760-1789"
					},
					{
						"tag": "Great Britain; Stamp Act (1765)"
					},
					{
						"tag": "Hancock, John, 1737-1793; Correspondence"
					},
					{
						"tag": "Merchants; England; London; History; 18th century"
					},
					{
						"tag": "NUCMC (US Library Of Congress) records"
					},
					{
						"tag": "Northampton County (Va.); History"
					},
					{
						"tag": "United States; Politics and government; To 1775"
					},
					{
						"tag": "Virginia; History; Colonial period, ca. 1600-1775"
					}
				],
				"notes": [
					{
						"note": "Contents of repository: 38,000,000 items\n\nRepository date coverage: 17th century - present\n\nRepository materials: All areas of American history and culture. Will also accept photographic copies of collections located elsewhere but within the scope of solicitation.\n\nHoldings: The Manuscript Division's holdings, more than fifty million items in eleven thousand separate collections, include some of the greatest manuscript treasures of American history and culture and support scholarly research in many aspects of political, cultural, and scientific history."
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.proquest.com/docview/1857162562/1CFAA6FD31BB4E64PQ/5?sourcetype=Historical%20Newspapers&parentSessionId=abcxyz",
		"items": [
			{
				"itemType": "newspaperArticle",
				"title": "March 25, 1958 (Page 17 of 30)",
				"creators": [],
				"date": "1958-03-25",
				"language": "English",
				"libraryCatalog": "ProQuest",
				"pages": "17",
				"place": "Pittsburgh, United States",
				"publicationTitle": "Pittsburgh Post-Gazette",
				"rights": "Copyright Pittsburgh Post Gazette Mar 25, 1958",
				"url": "https://www.proquest.com/docview/1857162562/1CFAA6FD31BB4E64PQ/5?sourcetype=Historical%20Newspapers",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf",
						"proxy": false
					}
				],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.proquest.com/docview/2778644623/fulltextPDF/DE90C00EE80640EDPQ/1?sourcetype=Dissertations%20&%20Theses",
		"items": [
			{
				"itemType": "thesis",
				"title": "A Comparison of the Mental Health of Police Officers and Correctional Officers in Rural Appalachia",
				"creators": [
					{
						"firstName": "Sierra",
						"lastName": "Thomas",
						"creatorType": "author"
					}
				],
				"date": "2022",
				"abstractNote": "The purpose of this study was to explore perceptions of mental health among police officers and correctional officers within rural Appalachia. The main goal of this research was to better understand how the occupational demands of working in the criminal justice field can impact one’s mental health over time. Several research questions were explored, including the prevalence of various mental health problems, associated stressors, the structure of support among officers, and the perceptions of mental health treatment services. Data were gathered through semi-structured interviews with 21 police and correctional officers located in rural Appalachia. Results provided a better understanding of the mental health of rural officers as well as the associated stressors and protective factors. Findings also further explored the perceptions and utilization of the available treatment services.",
				"language": "English",
				"libraryCatalog": "ProQuest",
				"numPages": "121",
				"place": "United States -- Tennessee",
				"rights": "Database copyright ProQuest LLC; ProQuest does not claim copyright in the individual underlying works.",
				"thesisType": "M.A.",
				"university": "East Tennessee State University",
				"url": "https://www.proquest.com/docview/2778644623/abstract/72FDDD77DA764D43PQ/1",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf",
						"proxy": false
					}
				],
				"tags": [
					{
						"tag": "Clinical psychology"
					},
					{
						"tag": "Correctional personnel"
					},
					{
						"tag": "Law enforcement"
					},
					{
						"tag": "Mental depression"
					},
					{
						"tag": "Mental disorders"
					},
					{
						"tag": "Mental health"
					},
					{
						"tag": "Post traumatic stress disorder"
					},
					{
						"tag": "Psychology"
					},
					{
						"tag": "Suicides & suicide attempts"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	}
]
/** END TEST CASES **/
