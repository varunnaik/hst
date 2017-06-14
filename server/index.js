const express = require('express')
const app = express()
app.use(express.static('public'))

const sqlite3 = require('sqlite3').verbose()
const db = new sqlite3.Database('data/homescript_test_db')

const fs = require('fs'); // Read CSV files

// For ImageIntelligence API
const request = require('request');

const uuidV4 = require('uuid/v4');


////////////////////////////////////////////////////////////////////////
let accessToken = null;
let pendingRequests = [];
let pendingRequestHandle = null;

// Create a database if one does not already exist
db.serialize(function() {
    db.run('CREATE TABLE IF NOT EXISTS images (guid TEXT, url TEXT, date TEXT, persondetected INTEGER)');
});

let checkPersonResult = function() {
    
    pendingRequests.forEach(function(id) {
        request.get(
        'https://api.imageintelligence.com/v1/find-person?customId='+id,
        {'auth': {
            'bearer': accessToken
        }},
        function (error, response, body) {
            // If we have a result then store it in the database.
            // If not then keep looking
            // Pop from list
            var results = JSON.parse(body);
            
            results.forEach(function(result) {
                db.serialize(function() {
                    var stmt = db.prepare("UPDATE images SET persondetected=? WHERE guid=?");
                    result.results.forEach(function(r) {
                        stmt.run(r.hasPerson, r.customId);                    
                    });
                    stmt.finalize();
                });
                
                if (result.status.code !== 'IN_PROGRESS') {
                    for (var i = 0; i < pendingRequests.length; i++) {                        
                        if (pendingRequests[i] === result.customId) {
                            pendingRequests.splice(i, 1);
                            break;
                        }
                    }
                }
            });
        }
        )
    });
    
    
    if (pendingRequests.length === 0) {
        clearInterval(pendingRequestHandle);
        pendingRequestHandle = null;
    }
}

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
        { 
            form: JSON.stringify({
              "items": images,      
              "customId": jobId
            }), 
            auth: {
                'bearer': accessToken
            }
        },
        
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                pendingRequests.push(jobId);
                if (pendingRequestHandle === null) {
                    pendingRequestHandle = setInterval(checkPersonResult, 10000);
                }
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
    var lines = fs.readFileSync(filename, "utf8").toString().split('\n').filter(l=>l.length > 0);
    var images = []; // Holds images we haven't seen yet
    lines.forEach(function(line) {
        line = line.replace(/^\uFEFF/, '')
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
  res.sendfile('index.html', { root: __dirname + "/relative_path_of_file" } );
})

app.get('/data', function(req,res) {
  let response = [];
  db.all("SELECT * FROM images ORDER BY date", function(err, rows) {
        res.json(rows);
    });  
});

app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
})
