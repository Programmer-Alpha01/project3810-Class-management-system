const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const methodOverride = require('method-override');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const port = 3000;

// MongoDB Configuration
const dbName = 'class_management_system';
const uri = "mongodb+srv://user123:user123@cluster0.nagcq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);
const collection_user = 'user';

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({
    secret: 'abc123!@#', // Replace with a strong secret key
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Use HTTPS in production
        httpOnly: true, // Prevent client-side access to cookies
        sameSite: 'strict', // Prevent CSRF
        maxAge: 1 * 60 * 60 * 1000 // 1 hour
    }
}));
app.use(express.static(path.join(__dirname, 'public')));


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(methodOverride('_method'));

// Utility functions
async function checkuser(db, username){
    const user = await db.collection(collection_user).findOne({ name: username});
  	if (user) {
    		console.log("User found with the provided username");
    		return true;
  	} else {
    		console.log('No User found with the provided username');
    		return false;
  }
}

async function checkemail(db, email){
    const user = await db.collection(collection_user).findOne({ email: email});
  	if (user) {
    		console.log("User found with the provided email");
    		return true;
  	} else {
    		console.log('No user found with the provided email.');
    		return false;
  }
}

async function checkpassword(db, password){
    const user = await db.collection(collection_user).findOne({ password: password});
    if (user) {
    		console.log("User found with the provided password");
    		return true;
  	} else {
    		console.log('No user found with the provided password.');
    		return false;
  }
}

function ensureAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.redirect('/login');
}

// Routes
app.get('/', (req, res) => {
    res.status(200).render('index', { title: "Home page" });
});

app.get('/about', (req, res) => {
    res.status(200).render('about', { title: "About Us" });
});

app.get('/contact', (req, res) => {
    res.status(200).render('contact', { title: "Contact Us" });
});

app.get('/home', ensureAuthenticated, (req, res) => {
    res.status(200).render('home', { title: "Home page", user: req.session.user });
});

app.get('/login', (req, res) => {
    res.status(200).render('login', { title: "Login" });
});

app.get('/logout', (req, res) => {
    // Destroy the session
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Error logging out.');
        }

        // Clear any cookies related to the session
        res.clearCookie('connect.sid'); // Default cookie name for express-session
        res.redirect('/'); // Redirect to index page
    });
});

app.get('/signup', (req, res) => {
    res.status(200).render('signup', { title: "Create an Account" });
});

app.get('/reset', (req, res) => {
    res.status(200).render('reset', { title: "Reset Password" });
});

// User Authentication
app.post('/logining', async function (req, res) {
    const email = req.body.email;
    const password = req.body.password;
    
    try {
        await client.connect();
        const db = client.db(dbName);
        if (await checkemail(db, email) && await checkpassword(db, password)) {
            req.session.user = email; // Store user email in session
            res.redirect('/home');
        } else {
            res.send("Invalid email or password");
        }
    } catch (err) {
        console.error(err);
        res.render('login', { error: 'An error occurred. Please try again.' });
    }
});

// Login route
app.post('/signuping', async function (req, res) {
    const username = req.body.username;
    const email = req.body.email;
    const password = req.body.password;
    const password_comfirm = req.body.password_comfirm;
    var error=0;
	
    console.log(username);
    console.log(email);
    console.log(password);
    console.log(password_comfirm);
    try {
    	// connecting to database
    	await client.connect();
    	const db = client.db(dbName);
        
        // check if not same name exist in database
    	if (await checkuser(db, username)) {
    	    var error =error+1;
            res.send("The username is already in use, please use another email address");
        }
        // check if not same email exist in database
    	if (await checkemail(db, email)) {
            var error =error+1;
            res.send("The email address is already in use, please use another email address");
        } 
        
        // check if not same password exist in database
    	if (await checkpassword(db, password)) {
            var error =error+1;
            res.send("The password is already in use, please use another password");
        }       
        
        // check password same to comfirm password 
    	if (password!=password_comfirm){
    	    var error =error+1;
    	    res.send("Password and comfirmation password not match !");
    	}

        if (username!=null && email!=null && password!=null && error==0){
            console.log("Creating a account");
            
            // get the current user count
            const userCount = await db.collection(collection_user).countDocuments();
        
            // create a new user document
            const user = {userID: userCount + 1,
                    password: password,
                    email: email,
                    name: username,
                    
            };
        
            // insert the new user document
            await db.collection(collection_user).insertOne(user);
            console.log("Sign up complete");
            res.redirect('/home');
        }
    } catch (err) {
        console.error(err);
        res.render('signup', { error: 'An error occurred. Please try again.' });
    }
});

// Password Reset
app.post('/reset', async function(req, res) {
    const username = req.body.username;
    const email = req.body.email;
    const newPassword = req.body.newPassword;
    
    try {
        await client.connect();
        const db = client.db(dbName);
        
        const user = await db.collection(collection_user).findOne({ name: username, email: email });
        
        if (user) {
        	
        	if(await checkpassword(db, newPassword)){
        		res.send("This password is already in used, please use anohter passowrd");
        	}else{
        		await db.collection(collection_user).updateOne({ name: username, email: email }, { $set: { password: newPassword } });
			console.log("Password reset and updated successfully");
            		res.redirect('/login');
        	}
        } else {
            res.send("User not found. Please check your username and email");
        }
    } catch (err) {
        console.error(err);
        res.send("An error occurred while resetting and updating the password. Please try again");
    }
});

// API Endpoints
// Route to fetch and display editable student data
app.get('/edit', ensureAuthenticated, async (req, res) => {
    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection('student');

        // Fetch all student records
        const students = await collection.find({}).toArray();

        // Ensure _id is converted to a string for use in the template
        students.forEach(student => {
            student._id = student._id.toString();  // Convert ObjectId to string
        });

        // Send students data to the EJS template
        res.render('editor', { title: "Edit", students });
    } catch (err) {
        console.error('Error fetching data:', err);
        res.status(500).send("Error fetching data.");
    }
});

app.post('/edit/saveAll', ensureAuthenticated,async (req, res) => {
    const studentUpdates = req.body.students;  

    if (!studentUpdates || typeof studentUpdates !== 'object') {
        return res.status(400).json({ success: false, message: 'Invalid student data' });
    }

    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection('student');

        for (const studentId in studentUpdates) {
            const studentData = studentUpdates[studentId];
            const trimmedStudentId = studentId.trim();  

            if (!ObjectId.isValid(trimmedStudentId)) {
                console.error(`Invalid student ID: ${trimmedStudentId}`);
                continue;  
            }

            const studentObjectId = new ObjectId(trimmedStudentId);
            const updatedFields = {};

            if (studentData['SID']) updatedFields["SID"] = studentData['SID'];
            if (studentData['First name']) updatedFields["First name"] = studentData['First name'];
            if (studentData['Last name']) updatedFields["Last name"] = studentData['Last name'];
            if (studentData['Gender']) updatedFields["Gender"] = studentData['Gender'];
            if (studentData.age) updatedFields["age"] = studentData.age.trim();
            if (studentData['Home address']) updatedFields["Home address"] = studentData['Home address'];
            if (studentData['phone address']) updatedFields["phone address"] = studentData['phone address'];
            if (studentData['Credit']) updatedFields["Credit"] = studentData['Credit'];
            if (studentData['ClassID']) updatedFields["ClassID"] = studentData['ClassID'];
            
            const result = await collection.updateOne(
                { _id: studentObjectId },
                { $set: updatedFields }
            );

            if (result.matchedCount === 0) {
                console.error(`Student with ID ${studentId} not found`);
            }
        }

        res.redirect('/edit');
    } catch (err) {
        console.error('Error updating students:', err);
        res.status(500).json({ success: false, message: 'Error updating students' });
    }
});

// Route to handle adding a new student
app.post('/edit/add', ensureAuthenticated,async (req, res) => {
    try {
        const { ClassID, SID, 'First name': firstName, 'Last name': lastName, Gender, age, 'Home address': homeAddress, 'phone address': phone, Credit } = req.body;

        // Connect to the database
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection('student');

        // Create a new student document
        const newStudent = {
            ClassID,
            SID,
            'First name': firstName,
            'Last name': lastName,
            Gender,
            age,
            'Home address': homeAddress,
            'phone address': phone,
            Credit
        };

        // Insert the new student into the database
        const result = await collection.insertOne(newStudent);

        res.redirect('/edit');
    } catch (error) {
        console.error('Error adding student:', error);
        res.json({ success: false, message: 'Error adding student' });
    }
});

// Route to delete a student record
app.delete('/edit/delete/:id', ensureAuthenticated,async (req, res) => {
    try {
        const studentId = req.params.id;
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection('student');
        await collection.deleteOne({ _id: new ObjectId(studentId) });
        res.redirect('/edit');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error deleting student');
    }
});

app.put('/edit/update/:id', (req, res) => {
    const studentId = req.params.id; // Get the student ID from the URL
    const updatedData = req.body; // Get the updated student data from the request body

    // Assuming you have a "students" collection in your MongoDB
    Student.findByIdAndUpdate(studentId, updatedData, { new: true })
        .then(updatedStudent => {
            if (!updatedStudent) {
                return res.status(404).send('Student not found');
            }
            res.json({
                success: true,
                message: 'Student updated successfully',
                student: updatedStudent
            });
        })
        .catch(err => {
            console.error('Error updating student:', err);
            res.status(500).send('Server error');
        });
});


// Add a GET route for login
app.get('/home', ensureAuthenticated,(req, res) => {
    if (req.session.user) {
        res.status(200).render('home', { title: "Home page", user: req.session.user });

    } else {
        res.redirect('/login');
    }
});

// Start the Server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
