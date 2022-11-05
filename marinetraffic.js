const cheerio = require('cheerio');
const request = require('request');
const _ = require('lodash');
const randomstring = require("randomstring");

const marineTrafficUrl = "https://www.marinetraffic.com"

const getId = function (url, id) {
    const raw = _.find(url.split('/'), function (i) {
        return _.includes(i, id + ":")
    });
    return (raw) ? raw.replace(id + ":", "") : "";
}

const getEntity = function (url) {
    if (_.find(url.split('/'), function (i) {
            return i === "ships";
        })) return "ships";
    if (_.find(url.split('/'), function (i) {
            return i === "stations";
        })) return "stations";
    if (_.find(url.split('/'), function (i) {
            return i === "ports";
        })) return "ports";
        if (_.find(url.split('/'), function (i) {
            return i === "lights";
        })) return "lights";
    return "";
}

const getCount = function (main) {
    const nav = main.find("div[class='page-nav-panel ']");
    return nav.find("div:contains('Found ')").children().first().find("strong").html();
}

const getPage = function (main) {
    const page = main.find("input[id='result_page']");
    if (!page || !page[0]) return 1;
    return page[0].attribs.value;
}

module.exports = {
    /*
        Scrape rule created August 2018. 
    */
    search: function (keyword, page) {
        return new Promise((resolve, reject) => {
            if (!page) page = 1;

            request.get(marineTrafficUrl + "/en/ais/index/search/all/per_page:50/keyword:" + keyword + "/page:" + page, function (error, response, body) {
                if (error) {
                    reject(error);
                    return;
                }
                const $ = cheerio.load(body);

                const main = $("main");

                const table = main.find("table[class='table table-hover text-left']");
                const rows = table.children();

                const shipDetails = [];
                rows.find("a[class='search_index_link']").each(function (index, element) {
                    const entity = getEntity(element.attribs.href);
                    const detail = {
                        entity: entity,
                        entityid: (entity === "ships") ? getId(element.attribs.href, "shipid") : _.last(element.attribs.href.split('/')),
                        name: $(element).html(),
                        type: element.attribs.title.replace($(element).html(), "").replace("(", "").replace(")", ""),
                        mmsi: getId(element.attribs.href, "mmsi"),
                        url: marineTrafficUrl + element.attribs.href
                    };
                    shipDetails.push(detail);
                });

                const result = {
                    totalCount: getCount(main),
                    page: getPage(main),
                    items: shipDetails,
                    itemCount: shipDetails.length
                };

                result.totalPages = (result.totalCount) ? Math.ceil(result.totalCount.replace(",", "") / 50) : 1;

                resolve(result);
            });
        });
    },
    ship: {
        info: {
            v1: function (mmsi) {
                return new Promise((resolve, reject) => {
                    const options = {
                        method: 'GET',
                        url: marineTrafficUrl + '/map/getvesseljson_v3/mmsi:' + mmsi,
                        headers: {
                            'Cache-Control': 'no-cache',
                            referer: marineTrafficUrl + '/en/ais/home/',
                            cookie: 'SERVERID=www1; vTo=1; CAKEPHP=' + randomstring.generate() + ';'
                        }
                    };

                    request(options, function (error, response, body) {
                        if (error || response.statusCode != 200) {
                            reject((error) ? error : body);
                            return;
                        }

                        const info = JSON.parse(body);

                        if ((info.data)) resolve(info.data.rows[0]);
                        else resolve({});
                    });
                });
            },
            v2: function (ship_id) {
                return new Promise((resolve, reject) => {
                    const options = {
                        method: 'GET',
                        url: marineTrafficUrl + '/en/ais/get_info_window_json',
                        qs: {
                            asset_type: 'ship',
                            id: ship_id
                        },
                        headers: {
                            'Cache-Control': 'no-cache',
                            'Vessel-Image': '00a9f0706fec2c78894adaa3be4ee154f616'
                        }
                    };

                    request(options, function (error, response, body) {

                        if (error || response.statusCode != 200) {
                            reject((error) ? error : body);
                            return;
                        }

                        const info = JSON.parse(body);

                        if ((info.values) && (info)) {
                            const payload = info.values;

                            payload.voyage = {};
                            if ((info.voyage)) {
                                _.forEach(_.filter(Object.keys(info.voyage), (k) => {
                                    return _.includes(k, "departure_port") || _.includes(k, "arrival_") || k == "dest_rep" ||
                                        k == "last_port_timestamp" || k == "triangle_pos";
                                }), (item) => {
                                    payload.voyage[item] = info.voyage[item];
                                });

                                delete payload.voyage.arrival_port_url;
                                delete payload.voyage.arrival_port_info_label;
                                delete payload.voyage.departure_port_info_label;
                                delete payload.voyage.departure_port_url;
                            }
                            delete payload.past_track_url;
                            delete payload.forecast_url;

                            resolve(payload);
                        } else resolve(undefined);
                    });
                });
            }
        }
    }
}