const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const Razorpay = require('razorpay');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// CORS Configuration
app.use(cors({
    origin: "https://incomparable-squirrel-587950.netlify.app", 
    methods: ["GET", "POST"],
    credentials: true
}));
app.use(express.json());

// Razorpay Setup (Test Keys)
const razorpay = new Razorpay({
    key_id: 'rzp_test_T8E9jrcaKG6WHM',
    key_secret: 'OsjGtvUjeEn71uNqXLZI0eRn'
});

// Multer Storage Setup
const upload = multer({ dest: 'uploads/' });

// Socket.io Connection
io.on('connection', (socket) => {
    console.log('✅ Dukan PC Connected to Live Pipeline!');
});

// 1. Create Order Endpoint
app.post('/create-order', async (req, res) => {
    try {
        const amount = req.body.amount || 10; // Default 10 if not provided
        const options = {
            amount: amount * 100, // Paise mein
            currency: "INR",
            receipt: "receipt_" + Math.random().toString(36).substring(7)
        };
        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        res.status(500).send(error);
    }
});

// 2. Normal PDF/Single Image Route (Purana wala)
app.post('/pay-and-print', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    
    // Yahan PC ko single file ka signal jayega
    const fileUrl = req.file.path; // Render relative path
    io.emit('print-job', { fileUrl: fileUrl, filename: req.file.originalname });
    
    res.json({ success: true, message: "Sent to printer!" });
});

// 3. NEW: ID Card (Front + Back) Merging Route
app.post('/pay-and-print-id', upload.fields([{ name: 'front' }, { name: 'back' }]), async (req, res) => {
    try {
        if (!req.files || !req.files['front'] || !req.files['back']) {
            return res.status(400).json({ error: "Both Front and Back images are required!" });
        }

        // 1. Naya blank A4 PDF banao
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([595.28, 841.89]); // A4 Size in points

        // 2. Dono files ko read karo
        const frontImageBytes = fs.readFileSync(req.files['front'][0].path);
        const backImageBytes = fs.readFileSync(req.files['back'][0].path);

        // 3. Check karo JPG hai ya PNG, aur embed karo
        const embedImage = async (bytes, mimetype) => {
            if (mimetype === 'image/png') return await pdfDoc.embedPng(bytes);
            return await pdfDoc.embedJpg(bytes);
        };

        const frontImg = await embedImage(frontImageBytes, req.files['front'][0].mimetype);
        const backImg = await embedImage(backImageBytes, req.files['back'][0].mimetype);

        // 4. Aadhar card standard dimension setup
        const idWidth = 240; 
        const idHeight = 150; 
        
        // Front image upar, Back image thik uske neeche set karo
        page.drawImage(frontImg, { x: 175, y: 600, width: idWidth, height: idHeight });
        page.drawImage(backImg, { x: 175, y: 430, width: idWidth, height: idHeight });

        // 5. Final PDF save karo
        const pdfBytes = await pdfDoc.save();
        const finalPdfPath = path.join(__dirname, 'uploads', `ID_Card_${Date.now()}.pdf`);
        fs.writeFileSync(finalPdfPath, pdfBytes);

        // 6. Dukan ke PC ko direct merged PDF bhej do!
        io.emit('print-job', { fileUrl: finalPdfPath, filename: 'ID_Card_Merged.pdf' });

        res.json({ success: true, message: "ID Card Merged & Sent to Printer!" });

    } catch (error) {
        console.error("Merging Error:", error);
        res.status(500).json({ error: "Failed to process ID Card" });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});