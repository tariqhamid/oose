# Master API

## Memory Methods

### Memory Create

* **URI** `/memory/create`
* **METHOD** `POST`
* **Session Required** no
* **Params** 
    * `name` Memory Name
    * `value` Memory Value
* **RESPONSE** 
    * `success` - Success message `Object created`
    * Message Object
        * `name` Memory Name
        * `value` Memory Value
        
### Memory Find

* **URI** `/memory/find`
* **METHOD** `POST`
* **Session Required** no
* **Params** 
    * `name` - Memory Name
* **RESPONSE** 
    * Message Object
        * `name` - Memory Name
        * `value` - Memory Value
        
### Memory Exists

* **URI** `/memory/exists`
* **METHOD** `POST`
* **Session Required** no
* **Params** 
    * `name` - Memory Name
* **RESPONSE** 
    * `success` - Success message `Result Found`
    * `true` - A true or false response to whether the memory object exists
    
### Memory Update

* **URI** `/memory/update`
* **METHOD** `POST`
* **Session Required** no
* **Params** 
    * `name` - Memory Name
    * `value` - Memory Value
* **RESPONSE** 
    * `success` - Success message `Object updated`
    * Updated Message Object
        * `name` - Memory Name
        * `value` - Memory Value
        
### Memory Remove

* **URI** `/memory/remove`
* **METHOD** `POST`
* **Session Required** no
* **Params** 
    * `name` - Memory Name
* **RESPONSE** 
    * `success` - Success message `Object removed`
    
## Prism Methods

### Prism Create

* **URI** `/prism/create`
* **METHOD** `POST`
* **Session Required** no
* **Params** 
    * `name` -Prism Name
    * `domain` -Prism Domain
    * `site` - Prism Site
    * `zone` - Prism Zone
    * `host` - Prism Host
    * `port` - Prism Port
* **RESPONSE** 
    * `success` - Success message `Prism instance created`
    * `id` - The id of the created Prism instance
    
### Prism Find

* **URI** `/prism/find`
* **METHOD** `POST`
* **Session Required** no
* **Params** 
    * `name` -Prism Name
* **RESPONSE**
    * Prism Instance
        * `id` - Prism Name
        * `site` - Prism Site Location
        * `zone` - Prism Zone Location
        * `host` - Prism Host
        * `port` - Prism Port
        * `createdAt` - Date the Prism was created
        * `updatedAt` - Date the Prism was last updated
        * `MasterId` - Prism Master ID
        
### Prism List

* **URI** `/prism/list`
* **METHOD** `POST`
* **Session Required** no
* **Params** none 
* **RESPONSE**
    * All Prism Instances
        * `id` - Prism Name
        * `site` - Prism Site Location
        * `zone` - Prism Zone Location
        * `host` - Prism Host
        * `port` - Prism Port
        * `createdAt` - Date the Prism was created
        * `updatedAt` - Date the Prism was last updated
        * `MasterId` - Prism Master ID
        
### Prism Update

* **URI** `/prism/update`
* **METHOD** `POST`
* **Session Required** no
* **Params** 
    * `name` - Prism Name
    * `site` - Prism Site Location
* **RESPONSE**
    * `success` - Success message `Prism instance updated`
    * Updated Prism Instance
        * `id` - Prism Name
        * `site` - Prism Site Location
        * `zone` - Prism Zone Location
        * `host` - Prism Host
        * `port` - Prism Port
        * `createdAt` - Date the Prism was created
        * `updatedAt` - Date the Prism was last updated
        * `MasterId` - Prism Master ID
        
### Prism Remove

* **URI** `/prism/remove`
* **METHOD** `POST`
* **Session Required** no
* **Params** 
    * `name` - Prism Name
* **RESPONSE**
    * `success` - Success message `Prism instance removed`
    
## Store Methods

### Store Create

* **URI** `/store/create`
* **METHOD** `POST`
* **Session Required** no
* **Params** 
    * `prism` -Prism The Store will be in
    * `name` -Store Name
    * `host` - Store Host
    * `port` - Store Port
* **RESPONSE** 
    * `success` - Success message `Store instance created`
    * `id` - The id of the created Store instance
    
### Store Find

* **URI** `/store/find`
* **METHOD** `POST`
* **Session Required** no
* **Params** 
    * `name` -Store Name
* **RESPONSE** 
    * Store instance
        * `id` - The Store ID
        * `name` - Store Name
        * `host` - Store Host
        * `port` - Store Port
        * `createdAt` - Date the store was created
        * `updatedAt` - Date the store was last updated
        * `PrismId` - The ID of the prism in which the Store is located
        
### Store List

* **URI** `/store/list`
* **METHOD** `POST`
* **Session Required** no
* **Params** 
    * `name` -Store Name
* **RESPONSE** 
    * All Store instances
        * `id` - The Store ID
        * `name` - Store Name
        * `host` - Store Host
        * `port` - Store Port
        * `createdAt` - Date the store was created
        * `updatedAt` - Date the store was last updated
        * `PrismId` - The ID of the prism in which the Store is located
        * `Prism` - The Prism Object in which the Store is located
        
### Store Update

* **URI** `/store/update`
* **METHOD** `POST`
* **Session Required** no
* **Params** 
    * `name` -Store Name
    * `port` - Store Port
* **RESPONSE** 
    * `success` - Success message `Store instance updated`
    * Updated Store instance
        * `id` - The Store ID
        * `name` - Store Name
        * `host` - Store Host
        * `port` - Store Port
        * `createdAt` - Date the store was created
        * `updatedAt` - Date the store was last updated
        * `PrismId` - The ID of the prism in which the Store is located
        
### Store Remove

* **URI** `/store/remove`
* **METHOD** `POST`
* **Session Required** no
* **Params** 
    * `name` - Store Name
* **RESPONSE**
    * `success` - Success message `Store instance removed`
    
## User Methods

### User Create

* **URI** `/user/create`
* **METHOD** `POST`
* **Session Required** yes
* **Params** 
    * `name` - User Name
    * `password` - User Password
* **RESPONSE**
    * `success` - Success message `User created`
    * User
        * `id` - User ID
        * `password` - Encrypted User password
        
### User Find

* **URI** `/user/find`
* **METHOD** `POST`
* **Session Required** yes
* **Params** 
    * `username` - User Name
* **RESPONSE**
    * User
        * `id` - User ID
        * `username` - User Name
        * `tokens` - User Tokens
        * `active` - Whether the User is active
        * `dateSeen` - Date the User last logged in
        * `dateFail` - Date the login last failed
        * `failIP` - The IP from which the login failed
        * `failReason` - The reason for the login fail
        * `createdAt` - Date the User was Created
        * `updatedAt` - Date the User was last Updated

### User Update

* **URI** `/user/update`
* **METHOD** `POST`
* **Session Required** yes
* **Params** 
    * `username` - User Name
    * `active` - Is the user active or not
* **RESPONSE**
    * `success` - Success message `User Updated`
    * Updated User Model
        * `id` - User ID
        * `username` - User Name
        * `tokens` - User Tokens
        * `active` - Whether the User is active
        * `dateSeen` - Date the User last logged in
        * `dateFail` - Date the login last failed
        * `failIP` - The IP from which the login failed
        * `failReason` - The reason for the login fail
        * `createdAt` - Date the User was Created
        * `updatedAt` - Date the User was last Updated
        
### User Login

* **URI** `/user/login`
* **Method** `POST`
* **Session Required** no
* **Params**
    * `username` - The user id for login
    * `password` - The password for the user
    * `ip` - The IP from which the user is logging in
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
    
### Remove

* **URI** `/user/remove`
* **Method** `POST`
* **Session Required** yes
* **Params** 
    * `username` - The User Name
* **Response**
    * `success` - Success message `User removed`
    
### User Password Reset

* **URI** `/user/password/reset`
* **METHOD** `POST`
* **Session Required** yes
* **Params** none
* **RESPONSE** 
    * `success` - Success message `User password reset`
    * New Password
    
### User Session Find

* **URI** `/user/session/find`
* **METHOD** `POST`
* **Session Required** yes
* **Params** 
    * `token` -The Session Token
    * `ip` -User Session IP
* **Response**
    * `session` - The resulting session object (to be used on future requests)
        * `data {}` The Session Data
        * `id` The Session ID
        * `token` The Session Token
        * `ip` The User IP address for the Session
        * `UserId` The User ID for the Session
        * `expires` The date the Session expires
        * `updatedAt` The last time the Session was updated
        * `createdAt` The date and time the Session was created
    * `user` - The User attached to the session
        * `id` - User ID
        * `username` - User Name
        * `tokens` - User Tokens
        * `active` - Whether the User is active
        * `dateSeen` - Date the User last logged in
        * `dateFail` - Date the login last failed
        * `failIP` - The IP from which the login failed
        * `failReason` - The reason for the login fail
        * `createdAt` - Date the User was Created
        * `updatedAt` - Date the User was last Updated
        
### User Session Validate

* **URI** `/user/session/validate`
* **METHOD** `POST`
* **Session Required** yes
* **Params** 
    * `token` -The Session Token
    * `ip` -User Session IP
* **Response**
    * `success` - Success message `Session Valid`
    * `session` - The resulting session object (to be used on future requests)
        * `data {}` -The Session Data
        * `id` -The Session ID
        * `token` -The Session Token
        * `ip` -The User IP address for the Session
        * `UserId` -The User ID for the Session
        * `expires` -The date the Session expires
        * `updatedAt` -The last time the Session was updated
        * `createdAt` - The date and time the Session was created
    * `user` - The User attached to the session
        * `id` - User ID
        * `username` - User Name
        * `tokens` - User Tokens
        * `active` - Whether the User is active
        * `dateSeen` - Date the User last logged in
        * `dateFail` - Date the login last failed
        * `failIP` - The IP from which the login failed
        * `failReason` - The reason for the login fail
        * `createdAt` - Date the User was Created
        * `updatedAt` - Date the User was last Updated
        
### User Session Update

* **URI** `/user/session/update`
* **METHOD** `POST`
* **Session Required** yes
* **Params** 
    * `token` -The Session Token
    * `ip` -User Session IP
    * `data` - User Session Data
* **Response**
    * `success` - Success message `Session Valid`
    * `session` - Updated Session Object
        * `data {}` - The Session Data
        * `id` - The Session ID
        * `token` - The Session Token
        * `ip` - The User IP address for the Session
        * `UserId` - The User ID for the Session
        * `expires` - The date the Session expires
        * `updatedAt` - The last time the Session was updated
        * `createdAt` - The date and time the Session was created
        * `UserId` - The User ID