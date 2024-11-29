const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const methodOverride = require('method-override');
const { MongoClient, ObjectId } = require('mongodb');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');

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
    secret: 'abc123!@#',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 1 * 60 * 60 * 1000 // 1 hour
    }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(methodOverride('_method'));

passport.use(new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
        try {
            await client.connect();
            const db = client.db(dbName);
            const user = await db.collection(collection_user).findOne({ email });

            if (!user) {
                console.log('No user with that email');
                return done(null, false, { message: 'No user with that email' });
            }

            const passwordMatch = await bcrypt.compare(password, user.password);
            if (!passwordMatch) {
                console.log('Incorrect password');
                return done(null, false, { message: 'Incorrect password' });
            }

            console.log('User authenticated successfully:', user);
            return done(null, user);
        } catch (err) {
            console.error('Error in LocalStrategy:', err);
            return done(err);
        }
    }
));

// Serialize and Deserialize User
passport.serializeUser((user, done) => {
    console.log('Serializing user:', user._id);
    done(null, user._id); 
});

passport.deserializeUser(async (id, done) => {
    console.log('Deserializing user ID:', id);
    try {
        const db = client.db(dbName);
        const user = await db.collection(collection_user).findOne({ _id: new ObjectId(id) });
        console.log('User after deserialization:', user);
        done(null, user); 
    } catch (error) {
        console.error('Error during deserialization:', error);
        done(error, null);
    }
});

// Authentication ensure
const ensureAuthenticated = (req, res, next) => {
    console.log('User authenticated?', req.isAuthenticated()); 
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
};

const checkLoggedIn = (req, res, next) => {
    if (req.isAuthenticated()) { 
        return res.redirect("/home")
    }
    next()
}

// Utility functions
async function findUserByField(db, field, value) {
    return await db.collection(collection_user).findOne({ [field]: value });
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

app.get('/home',ensureAuthenticated ,(req,res) => {
    res.status(200).render('home', { title: "Home page" });
});

app.get('/login',checkLoggedIn, (req, res) => {
    res.status(200).render('login', { title: "Login" });
});

app.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error('Error during authentication:', err);
            return next(err);
        }

        if (!user) {
            console.log('Authentication failed:', info);
            return res.status(401).render('login', { error: 'Invalid email or password' });
        }

        req.logIn(user, (err) => {
            if (err) {
                console.error('Error logging in:', err);
                return next(err);
            }

            console.log('Authentication successful:', user);
            res.redirect('/home'); 
        });
    })(req, res, next);
});

app.get('/logout', (req, res) => {
    req.logout(err => {
        if (err) {
            console.error('Error logging out:', err);
            return res.status(500).send('Error logging out.');
        }
        res.redirect('/');
    });
});

app.get('/reset', (req, res) => {
    res.status(200).render('reset', { title: "Reset Password" });
});

//sign up
app.get('/signup', (req, res) => {
    res.status(200).render('signup', { title: "Create an Account" });
});

app.post('/signup', async (req, res) => {
    const { username, email, password, password_comfirm } = req.body;

    if (password !== password_comfirm) {
        return res.status(400).render('signup', { error: "Passwords don't match" });
    }

    try {
        await client.connect();
        const db = client.db(dbName);

        const usernameExists = await db.collection(collection_user).findOne({ name: username });
        const emailExists = await db.collection(collection_user).findOne({ email });

        if (usernameExists || emailExists) {
            return res.status(400).render('signup', { error: 'Username or email already in use' });
        }

        const hashedPassword = await bcrypt.hash(password, 10); 

        const userCount = await db.collection(collection_user).countDocuments();
        const newUser = {
            userID: userCount + 1,
            name: username,
            email,
            password: hashedPassword =
        };

        await db.collection(collection_user).insertOne(newUser);
        res.redirect('/login');
    } catch (err) {
        console.error(err);
        res.status(500).render('signup', { error: 'An error occurred. Please try again.' });
    }
});

// Password Reset
app.post('/reset', async (req, res) => {
    const { username, email, newPassword } = req.body;

    try {
        await client.connect();
        const db = client.db(dbName);
        const user = await db.collection(collection_user).findOne({ name: username, email });
	const password = await findUserByField(db, 'password', newPassword);
	
	// User not exist
        if (!user) {
            return res.status(404).send("User not found. Please check your username and email.");
        }
	
	// User exist
        if (password) {
            return res.status(400).send("This password is already in use. Please choose another password.");
        }

        await db.collection(collection_user).updateOne(
            { name: username, email },
            { $set: { password: newPassword } }
        );

        res.redirect('/login');
    } catch (err) {
        console.error(err);
        res.status(500).send("An error occurred while resetting the password. Please try again.");
    }
});


// API Endpoints
// Route to fetch and display editable student data
app.get('/edit',ensureAuthenticated, async (req, res) => {
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

app.post('/edit/saveAll',ensureAuthenticated,async (req, res) => {
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
app.post('/edit/add',ensureAuthenticated,async (req, res) => {
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
app.delete('/edit/delete/:id',ensureAuthenticated,async (req, res) => {
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

app.put('/edit/update/:id',ensureAuthenticated, (req, res) => {
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
app.get('/home',ensureAuthenticated,(req, res) => {
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
