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
* **Params**
    * `password` - The password for the user
* **RESPONSE** 
    * `success` - Success message `User password reset`
  
### Session Validate

* **URI** `/user/session/validate`
* **METHOD** `POST`
* **Session Required** yes
* **Params** none
* **Response**
    * `success` - Success message `Session valid`
  
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
    
### Content Upload
    
* **URI** `/content/upload`
* **METHOD** `POST`
* **Session Required** yes
* **Params** 
    * `file` - File to be uploaded
* **Response** 
    * Object Containing File
    
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
    
### Content Remove
    
* **URI** `/content/remove`
* **METHOD** `POST`
* **Session Required** yes
* **Params**
    * `sha1` Content Sha1 ID
* **Response**
    * `success` - Success message `File removed`