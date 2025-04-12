{
	"translatorID": "59979260-f2cb-4558-9511-ae5e48f5cc4a",
	"label": "bangumi_translator",
	"creator": "xiaolonghuang",
	"target": "/^https?:\\/\\/chii\\.in\\/subject\\/\\d+$/",
	"minVersion": "5.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2025-04-12 04:26:54"
}
function detectWeb(doc, url) {
    var title = doc.querySelector("h1").textContent;
    if (title) {
        return "book";
    }
}

function doWeb(doc, url) {
	var item = new Zotero.Item("book");
	/*<ul id="infobox">
                                        <li class=""><span class="tip">中文名: </span>天审~WORLD WAR ANGEL~</li>
                                        <li class=""><span class="tip">册数: </span>3</li>
                                        <li class=""><span class="tip">话数: </span>16</li>
                                        <li class=""><span class="tip">作画: </span><a href="/person/13256" class="l" title="久世兰">久世蘭</a></li>
                                        <li class=""><span class="tip">出版社: </span><a href="/person/128" class="l" title="讲谈社">講談社</a>、<a href="/person/7033" class="l" title="东立出版社">東立出版社</a></li>
                                        <li class=""><span class="tip">连载杂志: </span><a href="/person/7579" class="l" title="月刊少年Rival">月刊少年ライバル</a></li>
                                        <li class=""><span class="tip">原作: </span><a href="/person/7823" class="l" title="外园昌也">外薗昌也</a></li>
                                        <li class=""><span class="tip">开始: </span>2011-06</li>
                                        <li class=""><span class="tip">结束: </span>2012-09</li>
                </ul>*/
				
	//原作和作画都是保留的，所以需要合并
	var authors={};
	//#infobox > li:nth-child(1)
	//li前面还有infobox啊
	
	// 抓取特定内容
/*"creators": [
        {
            "firstName": "",
            "lastName": "",
            "creatorType": "author",
            "fieldMode": 1
        },*/
		var creators = [];
		var infoboxItems = doc.querySelectorAll("ul#infobox li");
		infoboxItems.forEach(function(li) {
			var span = li.querySelector("span");
			if (span && span.textContent.includes("中文名")) {
				item.title = li.textContent.replace("中文名: ", "").trim();			
			}
			else {
			    item.title = doc.title.textContent.replace(" | Bangumi 番组计划", "").trim();	
			}
			if (span && span.textContent.includes("原作")) {
				var author = li.textContent.trim();
				creators.push({
					"firstName": "",
					"lastName": author,
					"creatorType": "author",
					"fieldMode": 1
				});
			}
			if (span && span.textContent.includes("作画")) {
				var author = li.textContent.trim();
				creators.push({
					"firstName": "",
					"lastName": author,
					"creatorType": "author",
					"fieldMode": 1
				});			    
			}
			//出版社
			if (span && span.textContent.includes("出版社")) {
				item.publisher = li.textContent.trim();
			}
			// 册数
			if (span && span.textContent.includes("冊数")) {
				item.numberOfVolumes = li.textContent.trim();
			}
			//日期
			if (span && span.textContent.includes("开始")) {
				item.date = li.textContent.trim();			    
			}
			if (span && span.textContent.includes("结束")) {
			    item.date = item.date + " - " + li.textContent.trim();
			}			
		});
		
		item.creators = creators;
	// //summary
	//#subject_summary
	// if (document.querySelector("#subject_summary")) {
	// 	item.summary = document.querySelector("#subject_summary").textContent;
	// }
	// //rank
	// // <span class="number" property="v:average">3.9</span>
	// if (document.querySelector("span.number")) {
	// 	item.rating = document.querySelector("span.number").textContent;
	// }
	item.url = url;
	// item.language = "zh-CN";
	item.complete();
}

/** BEGIN TEST CASES **/
var testCases = [
	{
		"type": "web",
		"url": "https://chii.in/subject/173914",
		"detectedItemType": false,
		"items": []
	}
]
/** END TEST CASES **/
