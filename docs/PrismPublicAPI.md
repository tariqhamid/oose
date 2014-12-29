# Prism Public API

## Methods

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
