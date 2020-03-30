const fs = require('fs-extra')
const http = require('http')
const path = require('path')

const { UPLOADS_PATH } = require('../config')
const { run, get } = require('../db')

const delay = msecs => new Promise((resolve) => setTimeout(resolve, msecs))

// via https://gist.github.com/falkolab/f160f446d0bda8a69172
// const TIMEOUT = 10000
function download (url, dest) {
  let file = fs.createWriteStream(dest)

  return new Promise(function (resolve, reject) {
    let req = http.get(url, function (res) {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        console.log('[downloader] statusCode:', res.statusCode)
        return reject(new Error('Download failed'))
      }
      let len = parseInt(res.headers['content-length'], 10)
      let downloaded = 0
      let percent = 0
      res
        .on('data', function (chunk) {
          file.write(chunk)
          downloaded += chunk.length
          percent = (100.0 * downloaded / len).toFixed(2)
          process.stdout.write(`[downloader] ${percent}% ${downloaded} bytes\r`)
        })
        .on('end', function () {
          file.end()
          console.log('')
          console.log('[downloader] single download complete')
          resolve()
        })
    }).on('error', function (err) {
      fs.unlink(dest)
      reject(err)
    })
    // req.setTimeout(TIMEOUT, function () {
    //   req.abort()
    //   cb(new Error(`request timeout after ${TIMEOUT / 1000.0}s`))
    // })
  })
}

async function next ({ ZCAM_URL, projectId }) {
  // find the earliest, complete, not downloaded take
  let take = get(
    `
    SELECT * from takes
    WHERE project_id = ?
    AND cut_at IS NOT NULL
    AND downloaded = 0
    ORDER BY date(ready_at)
    LIMIT 1
    `,
    projectId
  )

  if (take) {
    // grab associations
    let { scene_number } = get(`SELECT scene_number from scenes WHERE id = ?`, take.scene_id)
    let { shot_number } = get(`SELECT shot_number from shots WHERE id = ?`, take.shot_id)

    // source uri
    let uri = `${ZCAM_URL}${take.filepath}`

    // destination filepath
    let dirname = path.join('projects', projectId.toString(), 'takes')
    let filename = `scene_${scene_number}_shot_${shot_number}_take_${take.take_number}_id_${take.id}.mov`

    console.log(`[downloader] downloading …`)
    console.log(`[downloader] from: ${uri}`)
    console.log(`[downloader] to:   public/uploads/${path.join(dirname, filename)}`)

    fs.mkdirpSync(path.join(UPLOADS_PATH, dirname))

    await download(uri, path.join(UPLOADS_PATH, dirname, filename))

    run(
      `UPDATE takes
      SET downloaded = 1
      WHERE id = ?`,
      take.id
    )

    console.log('[downloader] updated download status for take')

    return take
  } else {
    return null
  }
}

let running = false

async function startup ({ ZCAM_URL }) {
  if (running) {
    console.warn('[downloader] startup() called but downloader is already in progress')
    return
  }

  console.log('[downloader] startup()')
  running = true

  while (running) {
    console.log('[downloader] checking for new files …')
    try {
      let take = await next({ ZCAM_URL, projectId: 1 })
      if (!take) {
        console.log('[downloader] queue complete. shutting down')
        await shutdown()
      }
    } catch (err) {
      console.error('[downloader] ERROR:', err.message)
    }

    await delay(1000)
  }
}

async function shutdown () {
  console.log('[downloader] shutdown()')
  running = false
}

module.exports = {
  startup,
  shutdown
}
