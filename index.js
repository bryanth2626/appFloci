const express = require("express")
const multer = require("multer")
const dotenv = require("dotenv")
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3")
const { TextractClient, DetectDocumentTextCommand } = require("@aws-sdk/client-textract")
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb")
const { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb")

dotenv.config()

const app = express()
const upload = multer({ storage: multer.memoryStorage() })

const BUCKET = process.env.AWS_S3_BUCKET
const PREFIX = process.env.AWS_S3_PREFIX
const TABLA = process.env.AWS_DYNAMODB_TABLE

const config = {
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
}

const textract = new TextractClient(config)
const s3 = new S3Client({ ...config, forcePathStyle: true })
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient(config), {
  marshallOptions: { removeUndefinedValues: true }
})

app.use(express.static("public"))

app.post("/upload", upload.single("archivo"), async (req, res) => {
  try {
    if (!req.file || !["image/jpeg", "image/png"].includes(req.file.mimetype)) {
      return res.status(400).json({ message: "Adjunta una imagen JPG o PNG" })
    }
    // obtener los datos enviados desde el formulario HTML
    const { razon_social, ruc, producto, total } = req.body

    if (!razon_social || !producto || !/^\d{11}$/.test(ruc) || !(parseFloat(total) >= 0)) {
      return res.status(400).json({ message: "Completa correctamente los campos obligatorios" })
    }

    // 1. Guardar imagen en Textract
    const resultado = await textract.send(new DetectDocumentTextCommand({
      Document: { Bytes: req.file.buffer }
    }))

    // 2. S3
    const id = Date.now().toString()
    const key = `${PREFIX}${id}-${req.file.originalname}`

    //almacenar imagen de comprobante y enviarla a s3
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }))

    // 3. DynamoDB, datos del comprobante
  
    await dynamodb.send(new PutCommand({
      TableName: TABLA,
      Item: { id, razon_social, ruc, producto, total: Number(total), imagen: key, textract: resultado }
    }))

    res.json({ success: true, message: "Comprobante registrado correctamente" })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: e.message })
  }
})

//Rutas, peticiones
// Listar desde DynamoDB
app.get("/comprobantes", async (req, res) => {
  try {
    const resultado = await dynamodb.send(new ScanCommand({ TableName: TABLA }))
    res.json(resultado.Items)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// Ver imagen guardada en S3
app.get("/imagen", async (req, res) => {
  try {
    const imagen = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: req.query.key }))
    res.type(imagen.ContentType)
    imagen.Body.pipe(res)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// Eliminar de DynamoDB y de S3
app.delete("/comprobantes/:id", async (req, res) => {
  try {
    const borrado = await dynamodb.send(new DeleteCommand({
      TableName: TABLA,
      Key: { id: req.params.id },
      ReturnValues: "ALL_OLD"
    }))
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: borrado.Attributes.imagen }))
    res.json({ success: true, message: "Comprobante eliminado" })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

app.listen(process.env.PORT, () => {
  console.log(`Servidor iniciado en: http://localhost:${process.env.PORT}`)
})