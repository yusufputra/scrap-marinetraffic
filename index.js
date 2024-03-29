const marinetraffic = require("./marinetraffic");
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const volleyball = require("volleyball");
const {
  Parser,
  transforms: { unwind },
} = require("json2csv");

const transforms = [unwind({ paths: ["data.light_iw"] })];
const json2csvParser = new Parser({ delimiter: ",", transforms });

app.set("json spaces", 2);
app.use(volleyball);

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.get("/", function (req, res) {
  res.json({ message: "welcome to our service!" });
});

app.get("/search", function (req, res) {
  console.log(req.query.type)
  marinetraffic
    .search(req.query.term, req.query.page ? req.query.page : 1)
    .then((response) => {
      res.setHeader("Content-Type", "application/json");
      if(!!req.query.type){
        const currentData = response.items.filter((item)=>item.type.toLowerCase().includes(req.query.type.toLowerCase()))
        res.send({...response, items: currentData , itemCount: currentData.length})
      }else{
        res.send(response);
      }
      
    })
    .catch((error) => {
      res.send(error);
    });
});

app.get("/ship/:mmsi", function (req, res) {
  marinetraffic.ship.info.v1(req.params.mmsi).then((response) => {
    marinetraffic.ship.info
      .v2(response.SHIP_ID)
      .then((_response) => {
        res.setHeader("Content-Type", "application/json");
        res.send(_response);
      })
      .catch((error) => {
        res.send(error);
      });
  });
});

app.get("/ship/collect/:collectmssi", function (req, res) {
  const mmsiData = req.params.collectmssi.split(",").sort();
  const responseDatas = [];
  const tempData = [];
  let currentMmsi = "";
  mmsiData.forEach((mmsi) => {
    if (!tempData.includes(mmsi)) {
      tempData.push(mmsi);
    }
  });
  tempData.forEach(async (mmsi, i) => {
    currentMmsi = mmsi;

    try {
      await marinetraffic.ship.info
        .v1(mmsi)
        .then(async (response) => {
          await marinetraffic.ship.info
            .v2(response.SHIP_ID)
            .then((_response) => {
              responseDatas.push({
                shipName: _response.shipname,
                mmsi: mmsi,
                ..._response,
                ..._response.voyage,
              });
            })
            .catch((e) => {
              throw e;
            });
        })
        .catch((e) => {
          throw e;
        });
    } catch (e) {
      console.log("error caused by mmsi ", currentMmsi)
    }
    if (mmsi === mmsiData[mmsiData.length - 1]) {
      if (req.query.export === "csv") {
        const tsv = await json2csvParser.parse(responseDatas);
        res.attachment(`ship-data-${new Date()}.csv`);
        res.send(tsv);
      } else {
        res.setHeader("Content-Type", "application/json");
        res.send(responseDatas);
      }
    }
  });
});

app.listen(process.env.PORT || 3000, () =>
  console.log("app listening on port 3000.")
);
