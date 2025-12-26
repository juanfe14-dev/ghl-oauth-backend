const express = require("express")
const axios = require("axios")

const app = express()
app.use(express.json())

app.get("/", (req, res) => {
  res.send("Backend OAuth GHL activo")
})

app.get("/oauth/start", (req, res) => {
  const url =
    "https://marketplace.gohighlevel.com/oauth/chooselocation" +
    "?response_type=code" +
    `&client_id=${process.env.CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}` +
    "&scope=locations/customFields.readonly locations/customFields.write contacts.readonly contacts.write locations/customValues.readonly locations/customValues.write"

  res.redirect(url)
})

app.get("/oauth/callback", async (req, res) => {
  try {
    const code = req.query.code
    if (!code) return res.status(400).send("No code")

    const tokenRes = await axios.post(
      "https://services.leadconnectorhq.com/oauth/token",
      {
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.REDIRECT_URI
      }
    )

    const { access_token, locationId } = tokenRes.data

    await axios.post(
      `https://services.leadconnectorhq.com/locations/${locationId}/customValues`,
      {
        name: "location_access_token",
        value: access_token
      },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Version: "2021-07-28"
        }
      }
    )

    res.send("OAuth instalado correctamente")
  } catch (e) {
    console.error(e.response?.data || e.message)
    res.status(500).send("Error OAuth")
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log("Servidor activo"))
