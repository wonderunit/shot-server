async function handler (response) {
  if (response.ok) {
    try {
      let json = await response.json()
      return [response, json]
    } catch (err) {
      return [response]
    }
  } else {
    // try {
    //   await response.json()
    //   throw new Error(json.errors.map(error => error.title))
    // } catch (err) {
    //   throw new Error(response.statusText)
    // }
    throw new Error(response.statusText)
  }
}

const closestScheduleEvent = el => el.closest('[data-controller="schedule-event"]')

const as12Hour = date => {
  let h = date.getHours()
  let m = date.getMinutes()

  let a = h < 12 ? 'am' : 'pm'
  h = h % 12 || 12

  return `${h}:${m.toString().padStart(2, '0')} ${a.toUpperCase()}`
}

// very basic turbolinks-style HTML reloader
function reload () {
  document.body.style.cursor = 'wait'

  fetch(window.location.toString())
    .then(response => response.text())
    .then(html => {
      let element = document.createElement('html')
      element.innerHTML = html
      let body = element.querySelector('body') || document.createElement('body')
      document.body.parentElement.replaceChild(body, document.body)
    })
    .catch(err => {
      document.body.style.cursor = ''
      console.error(err)
      alert('An error occurred. Please reload.')
    })
}

// const yPos = target => target.getBoundingClientRect().y + window.scrollY

class ScheduleController extends Stimulus.Controller {
  static targets = [ 'dragHandle' ]

  dragState = {}

  initialize () {
    this.placeholder = document.createElement('div')
    this.placeholder.classList.add('placeholder')
    this.placeholder.dataset.controller = 'placeholder'
    this.placeholder.dataset.action = `
      dragover->placeholder#dragOver
      dragenter->placeholder#dragOver

      dragleave->placeholder#dragLeave
    `
  }

  placeholderByElement (el) {
    return this.application.getControllerForElementAndIdentifier(
      el,
      'placeholder'
    )
  }

  scheduleEventByElement (el) {
    return this.application.getControllerForElementAndIdentifier(
      closestScheduleEvent(el),
      'schedule-event'
    )
  }

  pointerDown (event) {
    if (this.dragHandleTargets.includes(event.target)) {
      this.dragState = {
        // offset: event.pageY - yPos(event.target)
      }
    }
  }

  dragStart (event) {
    let scheduleEvent = this.scheduleEventByElement(event.target)

    if (scheduleEvent) {
      this.dragState = {
        ...this.dragState,
        source: scheduleEvent,
        rank: null
      }

      let height = scheduleEvent.element.getBoundingClientRect().height
      this.placeholder.style.height = `${height}px`
    }

    event.dataTransfer.dropEffect = 'move'
    event.dataTransfer.setData('text/plain', scheduleEvent.data.get('id'))

    setTimeout(() => { event.target.style.opacity = 0.1 }, 0)
  }

  dragOver (event) {
    let scheduleEvent = this.scheduleEventByElement(event.target)

    if (scheduleEvent) {
      if (scheduleEvent != this.dragState.source) {
        let { clientY } = event
        let { top, height } = scheduleEvent.element.getBoundingClientRect()
        let after = (clientY - top) / height > .5

        let head = scheduleEvent.data.get('event-type') == 'day'
        if (head) after = true

        let oldRank = parseInt(this.dragState.source.data.get('rank'))
        let newRank = parseInt(scheduleEvent.data.get('rank'))

        if (after) {
          scheduleEvent.element.parentNode.insertBefore(
            this.placeholder,
            scheduleEvent.element.nextSibling
          )
          // after 
          this.dragState.rank = newRank + ((newRank > oldRank) ? 0 : +1)
        } else {
          scheduleEvent.element.parentNode.insertBefore(
            this.placeholder,
            scheduleEvent.element
          )
          // before
          this.dragState.rank = newRank + ((newRank > oldRank) ? -1 : 0)
        }
      }
    }
  }

  drop (event) {
    event.preventDefault()

    let id = parseInt(event.dataTransfer.getData('text/plain'), 10)
    let rank = this.dragState.rank

    this.moveScheduledEvent(id, rank)
  }

  dragEnd (event) {
    // const { screenX, screenY } = event
    let scheduleEvent = this.scheduleEventByElement(event.target)

    scheduleEvent.element.style.opacity = 1.0

    this.dragState = {
      // offset: null
    }

    if (event.dataTransfer.dropEffect === 'none') {
      if (this.placeholder.parentNode) {
        this.placeholder.parentNode.removeChild(this.placeholder)
      }
    }
  }

  moveScheduledEvent (id, rank) {
    let projectId = this.data.get('project-id')
    let uri = `/projects/${projectId}/schedule`
    let body = {
      [id]: { rank }
    }
    fetch(
      uri,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    )
    .then(handler)
    .then(([{ ok, status }, result]) => {
      reload()
    })
    .catch(err => {
      alert(err)
    })
  }
}

class ScheduleEventController extends Stimulus.Controller {
  static targets = [ 'dragHandle' ]

  pointerDown (event) {
    // only allow drag from handle. interior text is selectable, not draggable.
    if (this.dragHandleTargets.includes(event.target) != true) {
      this.element.draggable = false
    } else {
      this.element.draggable = true
    }
  }

  editDate (event) {
    event.preventDefault()

    let startAt = new Date(this.data.get('startAt'))

    let placeholder = startAt.toLocaleDateString()
    let input = prompt('What date?', placeholder)

    let time = as12Hour(startAt)
    let string = input + ' ' + time

    let date = (new Date(Date.parse(string)))
    fetch(`/projects/${this.data.get('project-id')}/events/${this.data.get('id')}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startAt: date.toISOString() })
    })
    .then(handler)
    .then(reload)
    .catch(err => alert(err))
  }

  editStartAt (event) {
    event.preventDefault()

    let date = new Date(this.data.get('startAt'))

    let placeholder = as12Hour(date)

    let input = prompt('When should this day start? (e.g. 9:00 AM)', placeholder)

    try {
      let [t, h, m, a] = input.match(/(\d+):(\d+)(.+)/)
      h = parseInt(h, 10)
      m = parseInt(m, 10)
      if (h > 12 || m > 59) throw new Error('Invalid Date')
      a = a.trim().toLowerCase()
      if (a == 'pm' && h <  12) h = h + 12
      if (a == 'am' && h == 12) h = 0
      date.setHours(h)
      date.setMinutes(m)
      date.setSeconds(0)
    } catch (err) {
      alert('Could not understand time input.')
      return
    }

    let body = {
      startAt: date.toISOString()
    }

    fetch(`/projects/${this.data.get('project-id')}/events/${this.data.get('id')}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    .then(handler)
    .then(reload)
    .catch(err => alert(err))
  }

  addDay (event) {
    event.preventDefault()

    let id = this.data.get('id')
    let projectId = this.data.get('project-id')

    let uri = `/projects/${projectId}/events`
    let body = {
      insertAfter: id,
      eventType: 'day'
    }

    fetch(
      uri,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    )
    .then(handler)
    .then(([{ ok, status }, result]) => {
      reload()
    })
    .catch(err => {
      alert(err)
    })
  }

  addNote (event) {
    event.preventDefault()

    let description = prompt('Description:')
    if (description == null) return

    let id = this.data.get('id')
    let projectId = this.data.get('project-id')

    let uri = `/projects/${projectId}/events`
    let body = {
      insertAfter: id,
      eventType: 'note',
      description
    }

    fetch(
      uri,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    )
    .then(handler)
    .then(([{ ok, status }, result]) => {
      reload()
    })
    .catch(err => {
      alert(err)
    })
  }

  destroyEvent (event) {
    event.preventDefault()

    let id = this.data.get('id')
    let projectId = this.data.get('project-id')
    let uri = `/projects/${projectId}/events/${id}`

    if (confirm('Are you sure?')) {
      fetch( uri, { method: 'DELETE' })
      .then(handler)
        .then(reload)
      .catch(err => {
        alert(err)
      })
    }
  }
}

class AbstractInlineEditorController extends Stimulus.Controller {
  static targets = [ 'form', 'label', 'input', 'hint' ]
  state = 'idle' // idle, edit

  initialize () {
    this.transition(this.state)
    this.labelTargetDisplay = this.labelTarget.style.display
  }

  transition (state) {
    this.state = state
    this.inputTarget.style.display = state == 'idle' ? 'none' : 'block'
    this.labelTarget.style.display = state == 'idle' ? this.labelTargetDisplay : 'none'
    this.hintTarget.style.display = state == 'idle' ? 'none' : 'block'

    if (this.state == 'edit') {
      this.inputTarget.value = this.data.get('value')
      this.inputTarget.focus()
      this.inputTarget.select()
    }
  }

  edit (event) {
    this.transition('edit')
  }

  blur (event) {
    this.cancel()
  }

  change (event) {
    this.update()
  }

  keyUp (event) {
    if (event.key == 'Escape') this.cancel()
  }

  cancel () {
    this.transition('idle')
  }

  submit (event) {
    event.preventDefault()
    this.update()
  }

  update () {
    if (this.state != 'edit') return
    if (this.valid()) {
      this.save()
    }
  }

  valid () {
    return true
  }

  save () {
    //
  }
}


class InlineEditorController extends AbstractInlineEditorController {
  valid () {
    // let { value } = this.inputTarget
    // if (value.length == 0 || value.length == '') return false
    return true
  }

  save () {
    let uri = this.formTarget.action
    let { value } = this.inputTarget
    let body = {
      [this.data.get('key')]: value
    }
    fetch(
      uri,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    )
    .then(handler)
    .then(reload)
    .catch(err => alert(err))    
  }
}

class ScheduleNoteController extends AbstractInlineEditorController {
  valid () {
    let description = this.inputTarget.value
    if (description.length == 0 || description.length == '') return false
    return true
  }

  save () {
    let uri = this.formTarget.action
    let description = this.inputTarget.value
    let body = { description }

    fetch(
      uri,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    )
    .then(handler)
    .then(reload)
    .catch(err => alert(err))
  }
}

class PlaceholderController extends Stimulus.Controller {
  dragOver (event) {
    event.preventDefault()
    this.element.classList.add('highlight')
  }

  dragLeave (event) {
    this.element.classList.remove('highlight')
  }
}

export {
  ScheduleController,
  ScheduleEventController,
  InlineEditorController,
  ScheduleNoteController,
  PlaceholderController,
}
