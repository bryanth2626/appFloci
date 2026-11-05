const formulario = document.getElementById("formulario")
const mensaje = document.getElementById("mensaje")

formulario.addEventListener("submit", async (e) => {
  e.preventDefault()
  const respuesta = await fetch("/upload", { method: "POST", body: new FormData(formulario) })
  const datos = await respuesta.json()
  mensaje.textContent = datos.message
  if (datos.success) {
    formulario.reset()
    cargarComprobantes()
  }
})

// Llenar la tabla con los datos de DynamoDB
async function cargarComprobantes() {
  const respuesta = await fetch("/comprobantes")
  const comprobantes = await respuesta.json()
  const lista = document.getElementById("lista")
  lista.innerHTML = ""

  comprobantes.forEach(c => {
    const fila = document.createElement("tr")
    fila.innerHTML = `
      <td>${c.razon_social}</td>
      <td>${c.ruc}</td>
      <td>${c.producto}</td>
      <td>S/ ${Number(c.total).toFixed(2)}</td>
      <td>
        <button class="imagen">Ver imagen</button>
        <button class="json">Ver JSON</button>
        <button class="eliminar">Eliminar</button>
      </td>`

    fila.querySelector(".imagen").onclick = () => window.open("/imagen?key=" + c.imagen)
    fila.querySelector(".json").onclick = () => {
      document.getElementById("visor").textContent = JSON.stringify(c.textract, null, 2)
    }
    fila.querySelector(".eliminar").onclick = async () => {
      if (!confirm("¿Eliminar este comprobante?")) return
      const respuesta = await fetch("/comprobantes/" + c.id, { method: "DELETE" })
      const datos = await respuesta.json()
      mensaje.textContent = datos.message
      cargarComprobantes()
    }

    lista.appendChild(fila)
  })
}

cargarComprobantes()