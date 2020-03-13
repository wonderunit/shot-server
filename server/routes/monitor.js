const { get, all, run } = require('../db')

const Shot = require('../decorators/shot')
const Scene = require('../decorators/scene')
const Day = require('../decorators/day')

exports.show = (req, res, next) => {
  let { projectId } = req.params

  let project = get('SELECT * FROM projects WHERE id = ?', projectId)

  let event = get('SELECT * FROM events WHERE id = ?', project.slater_event_id)
  let shot = get('SELECT * FROM shots WHERE id = ?', event.shot_id)
  let scene = get('SELECT * FROM scenes WHERE id = ?', shot.scene_id)
  let takes = all('SELECT * FROM takes WHERE shot_id = ?', shot.id)

  let dates = Day.decorateCollection(all(`
    SELECT id, rank, start_at FROM events
    WHERE event_type = 'day'
    AND project_id = ?
    ORDER BY rank
  `, project.id
  ), { events: [] })

  let day = get(`
    SELECT * FROM events
    WHERE rank < ?
    AND event_type = 'day'
    AND project_id = ?
    ORDER BY rank DESC
    LIMIT 1
  `, event.rank, project.id
  )

  scene = new Scene(scene)
  shot = new Shot(shot)
  day = new Day({
    // single day properties
    ...day,
    // fill in calculated properties from collection
    ...dates.find(event => event.id == day.id),
  })

  let prevEvent = get(`
    SELECT * FROM events
    WHERE rank < ?
    AND shot_id IS NOT NULL
    AND event_type = 'shot'
    AND project_id = ?
    ORDER BY rank
    LIMIT 1
  `, event.rank, project.id)
  let prevShot = prevEvent && new Shot(get('SELECT * FROM shots WHERE id = ?', prevEvent.shot_id))
  let prevScene = prevEvent && new Scene(get('SELECT * FROM scenes WHERE id = ?', prevEvent.scene_id))

  let nextEvent = get(`
    SELECT * FROM events
    WHERE rank > ?
    AND shot_id IS NOT NULL
    AND event_type = 'shot'
    AND project_id = ?
    ORDER BY rank
    LIMIT 1
  `, event.rank, project.id)
  let nextShot = nextEvent && new Shot(get('SELECT * FROM shots WHERE id = ?', nextEvent.shot_id))
  let nextScene = nextEvent && new Scene(get('SELECT * FROM scenes WHERE id = ?', nextEvent.scene_id))

  let takeNumber = takes.length + 1

  let aspectRatio = scene.metadata.aspectRatio

  res.render('monitor', {
    project,
    event,
    shot,
    scene,
    day,
    
    takeNumber,

    prevShot,
    nextShot,
    prevScene,
    nextScene,

    aspectRatio,
  })
}
