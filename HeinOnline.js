{
	"translatorID": "3dcbb947-f7e3-4bbd-a4e5-717f3701d624",
	"label": "HeinOnline",
	"creator": "Frank Bennett",
	"target": "^https?://(www\\.)?heinonline\\.org/HOL/(LuceneSearch|Page|IFLPMetaData|AuthorProfile)\\?",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2025-06-20 17:11:32"
}

/*
	***** BEGIN LICENSE BLOCK *****
	Copyright © 2015-2016 Frank Bennett
	This file is part of Zotero.
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
	***** END LICENSE BLOCK *****
*/


/*
	***************
	** Utilities **
	***************
*/

// Get any search results from current page
// Used in detectWeb() and doWeb()
function getSearchResults(doc) {
	var results = doc.getElementsByClassName("lucene_search_result_b"),
		items = {},
		found = false;
	for (var i = 0, ilen = results.length; i < ilen; i++) {
		var url = getXPathStr("href", results[i], './/a[1]');

		var title = getXPathStr("textContent", results[i], './/a[1]');
		title = ZU.trimInternal(title);
		// title = title.replace(/\s*\[[^\]]*\]$/, '');

		if (!title || !url) continue;
		
		items[url] = title;
		found = true;
	}
	return found ? items : false;
}

// Get the string value of the first object matching XPath
function getXPathStr(attr, elem, path) {
	var res = ZU.xpath(elem, path);
	res = res.length ? res[0][attr] : '';
	return res ? res : '';
}

// Extract query values to keys on an object
function extractQueryValues(url) {
	var ret = {};
	ret.base = url.replace(/[a-zA-Z]+\?.*/, "");
	var query = url.replace(/.*?\?/, "");
	query = query.split("&");
	for (var i = 0, ilen = query.length; i < ilen; i++) {
		var pair = query[i].split("=");
		ret[pair[0]] = pair[1];
	}
	return ret;
}

// Not all pages have a downloadable PDF
async function translateRIS(ris, pdfURL) {
	var trans = Zotero.loadTranslator('import');
	trans.setTranslator('32d59d2d-b65a-4da4-b0a3-bdd3cfb979e7');// https://github.com/zotero/translators/blob/master/RIS.js
	trans.setString(ris);
	trans.setHandler('itemDone', function (obj, item) {
		if (pdfURL) {
			item.attachments = [{
				title: "Full Text PDF",
				url: pdfURL,
				mimeType: "application/pdf"
			}];
		}
		item.complete();
	});
	let transObject = await trans.getTranslatorObject();
	transObject.options.fieldMap = {
		VO: "volume"
	};
	await transObject.doImport();
}

function translateCOinS(COinS) {
	var item = new Zotero.Item();
	Zotero.Utilities.parseContextObject(COinS, item);
	item.complete();
}

// Build URL for RIS, and for PDF if available
async function scrapePage(doc, url) {
	// We need the id= and the handle= of the current target item.
	// From that, we can build URL for RIS.

	// Check for an RIS popup link in the page.
	var risLink = doc.querySelector('a[href*="CitationFile?kind=ris"]');
	if (risLink) {
		let risURL = risLink.href;
		let ris = await requestText(risURL);

		let pdfURL = null;
		// the PDF URL gives us a page that will refresh itself to the PDF.
		let pdfPageURL = doc.querySelector('[data-original-title*="Download PDF"]')?.href; // Resolve relative to current page
		if (pdfPageURL) {
			try {
				let pdfDoc = await requestDocument(pdfPageURL);

				// Call to pdfPageURL prepares PDF for download via META refresh URL
				let m = pdfDoc.querySelector('meta[http-equiv="Refresh"]');
				// Z.debug(pdfPage)
				// Z.debug(m)
				if (m) {
					let refreshURL;
					let parts = m.getAttribute('content').split(/;\s*url=/);
					if (parts.length === 2) {
						refreshURL = parts[1].trim().replace(/^'(.+)'/, '$1');
					}
					else {
						refreshURL = m.getAttribute('url');
					}
					pdfURL = new URL(refreshURL, pdfPageURL).toString();
					Z.debug('PDF URL ' + pdfURL);
				}
			}
			catch (e) {
				Zotero.debug(e);
			}
		}
		await translateRIS(ris, pdfURL);
	}
	else {
		// No RIS available in page, try COinS
		var COinS = getXPathStr("title", doc, '//span[contains(@class, "Z3988")]');
		if (COinS) {
			translateCOinS(COinS);
		}
	}
}

/*
	*********
	** API **
	*********
*/

function detectWeb(doc, url) {
	var COinS = getXPathStr("title", doc, '//span[contains(@class, "Z3988")]');
	var RIS = getXPathStr("href", doc, '//form[@id="pagepicker"]//a[contains(@href, "PrintRequest")][1]');
	if (url.includes("/LuceneSearch?") || url.includes("/AuthorProfile?")) {
		if (getSearchResults(doc)) {
			return "multiple";
		}
	}
	else if (COinS || RIS) {
		return "journalArticle";
	}
	return false;
}

async function doWeb(doc, url) {
	if (detectWeb(doc, url) == 'multiple') {
		let items = await Zotero.selectItems(getSearchResults(doc, false));
		if (!items) return;
		for (let url of Object.keys(items)) {
			await scrapePage(await requestDocument(url));
		}
	}
	else {
		await scrapePage(doc, url);
	}
}

/** BEGIN TEST CASES **/
var testCases = [
	{
		"type": "web",
		"url": "https://heinonline.org/HOL/IFLPMetaData?type=article&id=53254&collection=iflp&men_tab=srchresults&set_as_cursor=8",
		"items": [
			{
				"itemType": "journalArticle",
				"title": "Initiative test.",
				"creators": [
					{
						"firstName": "D.",
						"lastName": "Andrews",
						"creatorType": "author"
					}
				],
				"date": "2007",
				"libraryCatalog": "HeinOnline",
				"pages": "38",
				"publicationTitle": "International Financial Law Review",
				"url": "https://heinonline.org/HOL/IFLPMetaData?type=article&id=53254&collection=iflp",
				"volume": "26",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://heinonline.org/HOL/LuceneSearch?terms=test&collection=all&searchtype=advanced&typea=text&tabfrom=&submit=Go&all=true",
		"items": "multiple"
	},
	{
		"type": "web",
		"url": "https://heinonline.org/HOL/Page?handle=hein.journals/alterlj18&div=22&start_page=76&collection=journals&set_as_cursor=4&men_tab=srchresults",
		"items": [
			{
				"itemType": "journalArticle",
				"title": "Means Test or Mean Test Pension Entitlements for Farmers",
				"creators": [
					{
						"lastName": "Voyce",
						"firstName": "Malcolm",
						"creatorType": "author"
					}
				],
				"date": "1993",
				"issue": "2",
				"journalAbbreviation": "Alternative L.J.",
				"language": "eng",
				"libraryCatalog": "HeinOnline",
				"pages": "76-85",
				"publicationTitle": "Alternative Law Journal",
				"url": "https://heinonline.org/HOL/P?h=hein.journals/alterlj18&i=80",
				"volume": "18",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
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
		"url": "https://heinonline.org/HOL/AuthorProfile?action=edit&search_name=de%20Silva%20de%20Alwis%2C%20Rangita&collection=journals",
		"items": "multiple"
	}
]
/** END TEST CASES **/
