# Prism Public API

## User Methods

### Login

* **URI** `/user/login`
* **Method** `POST`
* **Session Required** no
* **Params**
    * `username` - The user id for login
    * `password` - The password for the user
* **Response**
    * `success` - Success message `User logged in`
    * `session` - The resulting session object (to be used on future requests)
        * `data {}` The Session Data
        * `id` The Session ID
        * `token` The Session Token
        * `ip` The User IP address for the Session
        * `UserId` The User ID for the Session
        * `expires` The date the Session expires
        * `updatedAt` The last time the Session was updated
        * `createdAt` The date and time the Session was created

### Logout

* **URI** `/user/logout`
* **Method** `POST`
* **Session Required** yes
* **Params** none
* **Response**
    * `success` - Success message `User logged out`

### Password Reset

* **URI** `/user/password/reset`
* **METHOD** `POST`
* **Session Required** yes
* **Params** none
* **RESPONSE** 
    * `success` - Success message `User password reset`
    * New Password
  
### Session Validate

* **URI** `/user/session/validate`
* **METHOD** `POST`
* **Session Required** yes
* **Params** none
* **Response**
    * `success` - Success message `Session valid`
    * `session` - The resulting session object (to be used on future requests)
        * `data {}` The Session Data
        * `id` The Session ID
        * `token` The Session Token
        * `ip` The User IP address for the Session
        * `UserId` The User ID for the Session
        * `expires` The date the Session expires
        * `updatedAt` The last time the Session was updated
        * `createdAt` The date and time the Session was created

  
### Session Update

* **URI** `/user/session/update`
* **METHOD** `POST`
* **Session Required** yes
* **Params** 
    * `data` - Information that needs to be stored with the session
* **Response** 
    * `success` - Success message `Session updated`
  
## Content Methods

### Content Details

* **URI** `/content/detail`
* **METHOD** `POST`
* **Session Required** no
* **Params**
    * `sha1` - Content Sha1 ID
* **Response**
    * Object Containing content
        * `file` The path to the file
        * `filename` The name of the file
        * `data` The file data
        * `type` The type of file (text, mp3)
        * `ext` The file extension
        * `sha1` The encrypted identifier of the file
        * `sha1Bogus` A bogus identifier of the file
        * `relativePath` A relative path for the file
    
### Content Upload

    * **URI** `/content/upload`
    * **METHOD** `POST`
    * **Session Required** yes
    * **Params**
        * `file` - File to be uploaded
            * Multipart safe upload that can take multiple files
    * **Response**
        * `success` - Success message `Content Uploaded`
        * Object Containing File
            * `file` The path to the file
            * `filename` The name of the file
            * `data` The file data
            * `type` The type of file (text, mp3)
            * `ext` The file extension
            * `sha1` The encrypted identifier of the file
            * `sha1Bogus` A bogus identifier of the file
            * `relativePath` A relative path for the file

### Content Retrieve

Download content directly to OOSE from a remote server.

* **URI** `/content/retrieve`
* **METHOD** `POST`
* **Session Required** yes
* **Params**
    * `request` - Request object for the node-request package
    * `extension` - The extension of the file indicating the mime type
* **Response**
    * 'sha1' - The SHA1 of the downloaded file
    * `extension` - File extension

### Content Purchase
    
* **URI** `/content/purchase`
* **METHOD** `POST`
* **Session Required** yes
* **Params**
    * `sha1` Content Sha1 ID
    * `token` Purchase Method
    * `life` Lifespan of the file
* **Response**
    * `success` - Success message `Purchase Created`
    * Returns the purchase token (optionally, the preferred token can be requested)
        * `sha1` The purchased content identifier
        * `ext` The purchased content extension
        * `token` The purchase token
        * `sessionToken` The session token
        * `life` The lifespan of the purchase
        * `ip` The purchasers IP Address
    
### Content Purchase Remove
    
* **URI** `/content/purchase/remove`
* **METHOD** `POST`
* **Session Required** yes
* **Params**
    * `PURCHASE TOKEN` The token received on the Purchase request
* **Response**
    * `success` - Success message `Purchase removed`