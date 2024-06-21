const express = require("express");
const cors = require("cors");
const app = express();
const jwt = require('jsonwebtoken');
require("dotenv").config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


//middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://seba-medical.web.app",
      "https://seba-medical.firebaseapp.com",
    ]
  })
);
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.rtcbpiy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
console.log(uri);
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {


    const userCollection = client.db("sebaDB").collection("users");
    const campCollection = client.db("sebaDB").collection("camps");
    const participantCampCollection = client.db("sebaDB").collection("participantCamp");
    const feedbackCollection = client.db("sebaDB").collection("feedback");
    const newsletterEmailCollection = client.db("sebaDB").collection("newsletterEmail");


    // jwt related api
    app.post("/jwt", async (req, res) => {
        const user = req.body;
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: "1h",
        });
        res.send({ token });
      });
  
      // middlewares
      const verifyToken = (req, res, next) => {
        console.log("inside verify token", req.headers.authorization);
        if (!req.headers.authorization) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        const token = req.headers.authorization.split(" ")[1];
        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
          if (err) {
            return res.status(401).send({ message: "unauthorized access" });
          }
          req.decoded = decoded;
          next();
        });
      };
  
      // use verify admin after verifyToken
      const verifyAdmin = async (req, res, next) => {
        const email = req.decoded.email;
        const query = { email: email };
        const user = await userCollection.findOne(query);
        const isAdmin = user?.role === "admin";
        if (!isAdmin) {
          return res.status(403).send({ message: "forbidden access" });
        }
        next();
      };

       // users related api
    // app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
    //     const result = await userCollection.find().toArray();
    //     res.send(result);
    //   });
  
      app.get("/users/admin/:email", verifyToken, async (req, res) => {
        const email = req.params.email;
  
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "forbidden access" });
        }
  
        const query = { email: email };
        const user = await userCollection.findOne(query);
        let admin = false;
        if (user) {
          admin = user?.role === "admin";
        }
        res.send({ admin });
      });
  
      app.post("/users", async (req, res) => {
        const user = req.body;
        const query = { email: user.email };
        const existingUser = await userCollection.findOne(query);
        if (existingUser) {
          return res.send({ message: "user already exists", insertedId: null });
        }
        const result = await userCollection.insertOne(user);
        res.send(result);
      });

      app.post("/create-payment-intent",verifyToken, async (req, res) => {
        const { campFees } = req.body;
        
        const floatPrice = parseFloat(campFees)
        const amount = parseInt(floatPrice * 100);
        console.log("Amount log: ", amount);
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      });

      app.post("/participant_camp",verifyToken,  async(req,res)=>{
        const data = req.body;
        const result = await participantCampCollection.insertOne(data);
        res.send(result)
      })

      app.get('/participant_camp', verifyToken, verifyAdmin, async(req, res)=>{
        const result = await participantCampCollection.find().toArray()
        res.send(result)
      })

      app.delete("/participant_camp/:id",verifyToken, async(req, res)=>{
        const id = req.params.id;
        const query = {_id: new ObjectId(id)}
        const result = await participantCampCollection.deleteOne(query);
        res.send(result)
      })

      app.post('/participant/:email',verifyToken, async(req, res)=>{
        const email = req.params.email;
        const query = {participantEmail: email}
        console.log('tarek',query);
        const result = await participantCampCollection.find(query).toArray()
        console.log('shikder',result);
        res.send(result)
      })

      app.put('/update-confirmation/:id',verifyToken,verifyAdmin, async(req, res)=>{
        const id = req.params.id;
        const query = {_id: new ObjectId(id)}
        const updateData = {
          $set: {
             confirmationStatus: 'Confirmed' 
          }
        }
        const result = await participantCampCollection.updateOne(query, updateData);
        res.send(result)

      })

      app.post('/feedback',verifyToken, async(req,res)=>{
        const data = req.body;
        const result = await feedbackCollection.insertOne(data)
        res.send(result)
      })

      app.get('/feedback', async(req, res)=>{
        const result = await feedbackCollection.find().toArray()
        res.send(result )
      })

      app.post('/newsletter', async(req, res)=>{
        const data = req.body;
        const result = await newsletterEmailCollection.insertOne(data)
        res.send(result)
      })

      app.post('/participantPayment/:campId',verifyToken, async(req, res)=>{
        const id = req.params.campId;
        const query  = {_id: new ObjectId(id)}
        const updateData = {
          $set: {
            paymentStatus: 'Paid'
          }
        }
        const result = await participantCampCollection.updateOne(query, updateData)
        res.send(result)
      })

      app.get('/camps', async(req,res)=>{
        let query = {};
        let sortOptions = {};

        if (req.query.search) {
          const searchRegex = new RegExp(req.query.search, 'i');
          query = { ...query, campName: { $regex: searchRegex } };
        }

        if (req.query.sort) {
          switch (req.query.sort) {
            case 'mostRegistered':
              sortOptions = { participantCount: -1 };
              break;
            case 'campFees':
              sortOptions = { campFees: 1 };
              break;
            case 'alphabeticalOrder':
              sortOptions = { campName: 1 };
              break;
            default:
              break;
          }
        }

        const camps = await campCollection.find(query).sort(sortOptions).toArray();
        res.json(camps);
      })

      app.get('/manageCamps', async(req, res)=>{
        const page = parseInt(req.query.page);
        const size = parseInt(req.query.size);
        const result = await campCollection.find().skip(page * size).limit(size).toArray();
        res.send(result)
      })

      app.post('/camps', verifyToken, verifyAdmin, async(req, res)=>{
        const data = req.body;
        const result = await campCollection.insertOne(data);
        res.send(result)
      })

      app.delete('/delete-camp/:id', verifyToken, verifyAdmin, async(req, res)=>{
        const id = req.params.id;
        const query = {_id: new ObjectId(id)}
        const result = await campCollection.deleteOne(query);
        res.send(result)
      })

      app.put('/update-camp/:campId', verifyToken, verifyAdmin, async(req, res)=>{
        const id = req.params.campId;
        const data = req.body;
        const query = {_id: new ObjectId(id)};

        const updateData = {
          $set: {
            campName: data.campName,
            image: data.image,
            campFees: data.campFees,
            dateTime: data.dateTime,
            location: data.location,
            healthcareProfessionalName: data.healthcareProfessionalName,
            description: data.description,
          }
        }

        const result = await campCollection.updateOne(query, updateData);
        res.send(result)
      })

      app.get('/camp-details/:id', async(req, res)=>{
        const id = req.params.id;
        const query = {_id: new ObjectId(id)};
        const result = await campCollection.findOne(query);
        res.send(result)
      });

      app.patch("/camp_patch/:id",verifyToken, async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const update = {
          $inc: { participantCount: 1 }
        };
        const result = await campCollection.updateOne(query, update);
        res.send(result);
      });

      // Pagination
      app.get('/campCount', async(req, res)=>{
        const count = await campCollection.estimatedDocumentCount()
        res.send({count})
      });
      




    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get("/", (req, res) => {
  res.send("coffee server is running");
});
app.listen(port, () => {
  console.log("Server running on port: ", port);
});