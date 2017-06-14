const express = require('express')
const app = express()

const sqlite3 = require('sqlite3').verbose()
const db = new sqlite3.Database('data/homescript_test_db')

const fs = require('fs'); // Read CSV files

// For ImageIntelligence API
const request = require('request');

const uuidV4 = require('uuid/v4');


////////////////////////////////////////////////////////////////////////
let accessToken = null;
let pendingRequests = []
let pendingRequestHandle = null;

// Create a database if one does not already exist
db.serialize(function() {
    db.run('CREATE TABLE IF NOT EXISTS images (guid TEXT, url TEXT, date TEXT, persondetected INTEGER)');
    db.run('CREATE TABLE IF NOT EXISTS jobs (id INTEGER, completed INTEGER)');
});

let requestPersonDetection = function(imageList) {
    const images = imageList.map(function(image) {
       return {
            url: image.url,
            customId: image.guid
        }
    });
    
    const jobId = uuidV4();
    
    // Make request
    request.post(
    'https://api.imageintelligence.com/v1/find-person',
    { json: {
      "items": images,      
      "customId": jobId
    } },
    function (error, response, body) {
        if (!error && response.statusCode == 200) {
            pendingRequests
        }
    }
    )
    
    
}

let addToDb = function(imageList) {
    // Given a list of images this adds them to db
    db.serialize(function() {
        var stmt = db.prepare("INSERT INTO images VALUES (?, ?, ?, -1)");
        
        imageList.forEach(function(imageData) {
            
            stmt.run(imageData.guid, imageData.url, imageData.timestamp);

        });
        stmt.finalize();
    });
}

let processCSV = function(filename) {
    var lines = fs.readFileSync(filename).toString().split('\n').filter(l=>l.length > 0);
    var images = []; // Holds images we haven't seen yet
    lines.forEach(function(line) {
        let parts = line.split(',');
        images.push({
            timestamp: parts[1],
            url: parts[0],
            guid: parts[0].split('/').pop().substring(0,41)
        });
    });
    return images;
}


let startup = function() {    
 
    // First of all, look for new data and process it if required
    const images = processCSV('data/Snapshots_DateTimes.csv');
    
    db.all("SELECT guid FROM images", function(err, rows){
        
        let existingGUIDs = {}
        rows.forEach(function(row) {
            existingGUIDs[row.guid] = true;
        });
        
        let newImages = images.filter(function(image) {
            return ! (image.guid in existingGUIDs)
        });

        addToDb(newImages);
        
        requestPersonDetection(newImages);        
    });        
    
}

let getAccessToken = function (callback) {
    request.post(
        'https://api.imageintelligence.com/v1/oauth/token',
        { json: {
            "clientId": "bc1DhUbNEwkT5hO9aUArzYQp3a8DzIv4",
            "clientSecret": "QUU84ppIAWeMSO5mMxAc1fADQtJjcWjkhHHxdo5z5zMOKZQmUlgd5P7GI8NU49s7"
        }},
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                accessToken = body.accessToken;
                callback();
            } else {
                throw error;
            }
        }
    ); 
}

getAccessToken(startup);

app.get('/', function (req, res) {
  // Get all the data in the database and update it all
})

app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
})
