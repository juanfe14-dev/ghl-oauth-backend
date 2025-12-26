const express = require("express")
const axios = require("axios")

const app = express()
app.use(express.json())

/**
 * Health check
 */
app.get("/", (req, res) => {
  res.send("Backend OAuth GHL activo")
})

/**
 * STEP 1: Iniciar OAuth
 */
app.get("/oauth/start", (req, res) => {
  const url =
    "https://marketplace.gohighlevel.com/oauth/chooselocation" +
    "?response_type=code" +
    `&client_id=${process.env.CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}` +
    "&scope=" +
    encodeURIComponent(
      "locations/customFields.readonly " +
      "locations/customFields.write " +
      "contacts.readonly " +
      "contacts.write " +
      "locations/customValues.readonly " +
      "locations/customValues.write"
    )

  res.redirect(url)
})

/**
 * STEP 2: Callback OAuth
 */
app.get("/oauth/callback", async (req, res) => {
  try {
    const code = req.query.code

    if (!code) {
      return res.status(400).send("No authorization code received")
    }

    /**
     * Intercambiar code por access_token
     * (OAuth REQUIERE x-www-form-urlencoded)
     */
    const params = new URLSearchParams()
    params.append("client_id", process.env.CLIENT_ID)
    params.append("client_secret", process.env.CLIENT_SECRET)
    params.append("grant_type", "authorization_code")
    params.append("code", code)
    params.append("redirect_uri", process.env.REDIRECT_URI)

    const tokenResponse = await axios.post(
      "https://services.leadconnectorhq.com/oauth/token",
      params,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    )

    const {
      access_token,
      refresh_token,
      locationId,
      expires_in
    } = tokenResponse.data

    /**
     * Crear Custom Value en la subcuenta
     */
    await axios.post(
      `https://services.leadconnectorhq.com/locations/${locationId}/customValues`,
      {
        name: "location_access_token",
        value: access_token
      },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Version: "2021-07-28",
          "Content-Type": "application/json"
        }
      }
    )

    /**
     * (Opcional pero recomendado)
     * Guardar expires_at o refresh_token en DB aquí
     */

    res.send(`
      <h2>OAuth instalado correctamente</h2>
      <p><strong>Location ID:</strong> ${locationId}</p>
    `)

  } catch (error) {
    console.error("OAuth ERROR:")
    console.error(error.response?.data || error.message)

    res.status(500).send("Error OAuth")
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Servidor OAuth activo en puerto ${PORT}`)
})
