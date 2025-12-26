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
 * STEP 1 – Iniciar OAuth
 */
app.get("/oauth/start", (req, res) => {
  const scopes = [
    "locations/customFields.readonly",
    "locations/customFields.write",
    "contacts.readonly",
    "contacts.write",
    "locations/customValues.readonly",
    "locations/customValues.write"
  ].join(" ")

  const url =
    "https://marketplace.gohighlevel.com/oauth/chooselocation" +
    "?response_type=code" +
    `&client_id=${process.env.CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scopes)}`

  res.redirect(url)
})

/**
 * STEP 2 – OAuth Callback
 */
app.get("/oauth/callback", async (req, res) => {
  try {
    const { code } = req.query

    if (!code) {
      return res.status(400).send("Authorization code no recibido")
    }

    /**
     * Intercambiar code por access token
     * (x-www-form-urlencoded OBLIGATORIO)
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
     * Crear o actualizar Custom Value (UPSERT)
     * Este custom value NO existe en el snapshot
     */
    try {
      // Intentar CREAR
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
    } catch (err) {
      // Si ya existe → ACTUALIZAR
      if (
        err.response?.data?.message?.includes("already exists")
      ) {
        await axios.put(
          `https://services.leadconnectorhq.com/locations/${locationId}/customValues/location_access_token`,
          {
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
      } else {
        throw err
      }
    }

    /**
     * (Recomendado)
     * Aquí puedes guardar refresh_token y expires_in en DB
     */

    res.send(`
      <h2>OAuth instalado correctamente</h2>
      <p><strong>Location ID:</strong> ${locationId}</p>
      <p>Custom Value <b>location_access_token</b> creado / actualizado</p>
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
