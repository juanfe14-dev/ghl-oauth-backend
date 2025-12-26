const express = require("express")
const axios = require("axios")

const app = express()
app.use(express.json())

/**
 * ================================
 * SIMPLE TOKEN STORE (IN-MEMORY)
 * locationId -> access_token
 * ================================
 * En producción: usar DB
 */
const locationTokenStore = {}

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

    // Intercambiar code por token
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
     * Guardar token por subcuenta
     */
    locationTokenStore[locationId] = {
      access_token,
      refresh_token,
      expires_at: Date.now() + expires_in * 1000
    }

    /**
     * Crear / actualizar custom value en la subcuenta
     */
    try {
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
      if (err.response?.data?.message?.includes("already exists")) {
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

    res.send(`
      <h2>OAuth instalado correctamente</h2>
      <p><b>Location ID:</b> ${locationId}</p>
      <p>Token guardado y Custom Value creado / actualizado</p>
    `)

  } catch (error) {
    console.error("OAuth ERROR:", error.response?.data || error.message)
    res.status(500).send("Error OAuth")
  }
})

/**
 * STEP 3 – Recibir survey desde workflow base
 */
app.post("/process-survey", async (req, res) => {
  try {
    const { locationId, contact } = req.body

    if (!locationId || !contact) {
      return res.status(400).json({ error: "locationId o contact faltante" })
    }

    const tokenData = locationTokenStore[locationId]
    if (!tokenData) {
      return res.status(400).json({
        error: "La subcuenta no tiene la app OAuth instalada"
      })
    }

    const accessToken = tokenData.access_token

    /**
     * Upsert contacto en la subcuenta destino
     */
    await axios.post(
      "https://services.leadconnectorhq.com/contacts/upsert",
      {
        locationId,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        customFields: {
          Alabama: contact.alabama,
          Alaska: contact.alaska,
          Arizona: contact.arizona,
          NPN: contact.npn,
          "Agent Profile Photo": contact.profilePhoto
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: "2021-07-28",
          "Content-Type": "application/json"
        }
      }
    )

    res.json({ status: "OK", message: "Contacto creado / actualizado" })

  } catch (error) {
    console.error("PROCESS SURVEY ERROR:", error.response?.data || error.message)
    res.status(500).json({ error: "Error procesando survey" })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Servidor OAuth activo en puerto ${PORT}`)
})
