 /******************************************************
 * PLEASE DO NOT EDIT THIS FILE
 * the verification process may break
 * ***************************************************/

'use strict';

var fs = require('fs');
var express = require('express');
var app = express();

var mongodb = require('mongodb').MongoClient;
var https = require('https');

var MONGODB_URI = 'mongodb://'+process.env.USER+':'+process.env.PASS+'@'+process.env.HOST+':'+process.env.DB_PORT+'/'+process.env.DB;

if (!process.env.DISABLE_XORIGIN) {
  app.use(function(req, res, next) {
    var allowedOrigins = ['https://narrow-plane.gomix.me', 'https://www.freecodecamp.com'];
    var origin = req.headers.origin || '*';
    if(!process.env.XORIG_RESTRICT || allowedOrigins.indexOf(origin) > -1){
         console.log(origin);
         res.setHeader('Access-Control-Allow-Origin', origin); 
         res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    }
    next();
  });
}

app.use('/public', express.static(process.cwd() + '/public'));

app.route('/_api/package.json')
  .get(function(req, res, next) {
    console.log('requested');
    fs.readFile(__dirname + '/package.json', function(err, data) {
      if(err) return next(err);
      res.type('txt').send(data.toString());
    });
  });
  
app.route('/')
    .get(function(req, res) {
		  res.sendFile(process.cwd() + '/views/index.html');
    })

app.route('/api/test/:query')
    .get(function(req,res){
      if(req.query.offset){  res.send("offset exists: " + req.query.offset); } else {res.send("no offset");}
        //res.send({"query" : req.params.query, "offset" : req.params.offset});
    });

app.route('/api/imagesearch/:query')
    .get(function(req,res){
  
      let date = new Date().toISOString(); //used in storing search in 'recent' database
      let searchData = {"term" : req.params.query, "when" : date};
      let offset = "1";  
      if(req.query.offset && parseInt(req.query.offset) != NaN){
        offset = req.query.offset;
      }
  
      /*insert search into 'recent' database and delete oldest*/
      mongodb.connect(MONGODB_URI, function(err, mongoClient){
        if(err){
          res.send(err.status || 400)
            .type('txt')
            .send(err.message || "Could not connect to DB");
        }
        var db = mongoClient.db(process.env.DBNAME);
       
        db.collection('recent').find({}).toArray(function(err,docs){
          
         if(err){
           res.send(err.status || 400)
            .type('txt')
            .send(err.message || "Could not connect to DB");
          }
         
          docs.sort((a,b) => {
            if(a.when < b.when)
              return -1;
            if(a.when > b.when)
              return 1;
            return 0;
          })
         
          console.log(docs[0].when);
          console.log(docs[0].term);
          db.collection('recent').deleteOne({"when": docs[0].when});
        });
        db.collection('recent').insertOne(searchData);
      });
  
  
      var url = "https://www.googleapis.com/customsearch/v1?" + 
          "num=" + 10 +
          "&q=" + req.params.query + 
          "&searchType=image" + 
          "&start=" + offset +
          "&cx=" + process.env.CSE_ID + 
          "&key=" + process.env.API_KEY +
          "&fields=items(title,link,snippet)";
      
      var request = https.request(url, (response) => {
        let block = [];
        response.on('data', (d) => {
          block.push(d);
        }).on('end', () =>{
          var results = JSON.parse(block.join());
          var images = [];
          for (var i in results.items){
            images = images.concat({
              "title" : results.items[i].title,
              "link" : results.items[i].link,
              "snippet" : results.items[i].snippet,
              //"thumbnail" : results.items[i].image.thumbnailLink //sometimes image is not returned?
            });
          }
          res.send({images});
        }).on('error', (e) => {
        console.error(e);
        res.send(e);
      });
    }).end();
});

app.route('/api/latest')
  .get(function(req,res){
  //{term: term-searched-for, when: datetime-searched-for}, max 10 results
  mongodb.connect(MONGODB_URI, function(err, mongoClient){
      if(err){
        res.send(err.status || 400)
          .type('txt')
          .send(err.message || "Could not connect to DB");
      }
      var db = mongoClient.db(process.env.DBNAME);
      db.collection('recent').find({},{projection: { _id: false}}).toArray(function(err,docs){
        if(err) {
          res.send(err.status || 400)
            .type('txt')
            .send(err.message || "Could not connect to DB");
        } 
        res.send(docs);
      });
    });
  });


// Respond not found to all the wrong routes
app.use(function(req, res, next){
  res.status(404);
  res.type('txt').send('Not found');
});

// Error Middleware
app.use(function(err, req, res, next) {
  if(err) {
    res.status(err.status || 500)
      .type('txt')
      .send(err.message || 'SERVER ERROR');
  }  
})

app.listen(process.env.PORT, function () {
  console.log('Node.js listening ...');
});

