# Store API

## Content Methods

### Content Upload

* **URI** `/content/put/:file`
* **METHOD** `PUT`
* **Session Required** yes
* **Params**
    * `file` A file
        * `key` A key for the file
        * `tmpfile` A temporary file
        * `name` The file name
        * `encoding` Bryan Tong Complete this <---
        * `mimetype` The file type
        * `ext` File extension (from the mimetype)
        * `hash` File hash identifier
    * `prism` A prism in which to place the file
* **Response**
    * `path` A path for the file
    * `pathname` The path name for the file
    * `href` A link to the file
    
### Content Download

* **URI** `/content/download`
* **METHOD** `POST`
* **Session Required** yes
* **Params**
    * `hash` - Content hash ID
* **Response**
    * Object Containing File
        * `file` The path to the file
        * `filename` The name of the file
        * `data` The file data
        * `type` The type of file (text, mp3)
        * `ext` The file extension
        * `hash` The encrypted identifier of the file
        * `hashBogus` A bogus identifier of the file
        * `relativePath` A relative path for the file
        
### Content Exists

* **URI** `/content/exists`
* **METHOD** `POST`
* **Session Required** no
* **Params**
    * `hash` - Content hash ID
* **Response**
    * `hash` The hash identifier for the content
    * `exists` A true or false statement whether the content exists
    * `count` Content count
    * `map` The location of the content in all prisms it exists on
    
### Content Remove

* **URI** `/content/remove`
* **METHOD** `POST`
* **Session Required** no
* **Params**
    * `hash` - Content hash ID
* **Response**
    * `success` - Success message `File removed`
    
## Purchase Methods

### Purchase Create

* **URI** `/purchase/create`
* **METHOD** `POST`
* **Session Required** yes
* **Params**
    * `hash` Content hash ID
* **Response**
    * `success` - Success message `Purchase Created`
    * Returns the purchase token (optionally, the preferred token can be requested)
        * `ext` The purchased content extension
        * `token` The purchase token
        * `path` The path to the content
        * `map` The locations of the content in all prisms
        
### Purchase Find
     
* **URI** `/purchase/find`
* **METHOD** `POST`
* **Session Required** yes
* **Params**
    * `PURCHASE TOKEN` The token received in the purchase creation
* **Response**
    * Returns the purchase token (optionally, the preferred token can be requested)
        * `ext` The purchased content extension
        * `token` The purchase token
        * `path` The path to the content
        * `map` The locations of the content in all prisms
        
### Purchase Update
     
* **URI** `/purchase/update`
* **METHOD** `POST`
* **Session Required** yes
* **Params**
    * `PURCHASE TOKEN` The purchase token
* **Response**
    * Returns the purchase object reflecting any changes
        * `ext` The purchased content extension
        * `token` The purchase token
        * `path` The path to the content
        * `map` The locations of the content in all prisms
        
### Purchase Remove

* **URI** `/purchase/remove`
* **METHOD** `POST`
* **Session Required** yes
* **Params**
    * `PURCHASE TOKEN` The token received on the Purchase request
* **Response**
    * `success` - Success message `Purchase removed`